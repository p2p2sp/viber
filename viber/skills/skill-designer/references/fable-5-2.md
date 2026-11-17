# Claude Fable 5.2

Alias `fable`, ID `claude-fable-5-2`. Context 1M, output 128K, knowledge through Jun 2026. $8/$40 per MTok (2x Opus 5.5), cache reads $0.20 (2.5 percent of input), so cache-heavy long sessions close much of the gap. Thinking always on; effort default `high`.

## Effort

- Start at `high` and sweep `medium` and `xhigh`: most of the gain arrives by `high`, gains above it are uneven and task-dependent. Never reuse a level tuned on another model.
- `low`: quick back-and-forth, well-specified tasks, fast subagents; it scores close to Fable 5.1 at higher effort. `medium`: interactive coding, chat, everyday knowledge work. `high`: hard coding, research, long unattended runs. `xhigh`: only the hardest long-running work where a gain is measured. `max`: ceiling measurement or open-ended research.
- At `high` and above it thinks before almost every reply, a greeting included: give easy roles a lower level.
- "Answer directly without deliberating" does not stop thinking at `medium` and above: delete such lines and lower effort instead.
- Effort barely changes reply length: set length and tone in the prompt.

## Autonomy

- Ends long tasks early (lists what remains, offers to continue, stops at a timeout), more at `low` and `medium`. For an unattended agent add under `# Finishing work`: "Please avoid stopping while you still owe work the user asked for. Be persistent and do not stop unless needed. While status notes are welcome, as is clarifying with the user on open decisions, carry on with work that does not depend on the user's answer without unnecessary stops. If you notice yourself inviting the user to redirect you or offering to wait, instead proceed on the next part of the task. You may meet ordinary obstacles like errors, timeouts, locked files, empty results or failing tools. Diagnose them first, and when they are not real blockers, work through them with the access you have (wait and retry, fix the request, use another tool or source) rather than stopping unnecessarily. If someone clearly decided something is a hard blocker, such as a file marked not to be touched, access that was intentionally withheld, or a safety guardrail, leave it alone, say plainly what you found, and look for another safe way to finish the task. Stopping before the task is complete is very rarely merited, as in when the task can't move forward without user input, or where the blocker is deliberate and should not be worked past. This does not override the need for confirmation on risky or destructive actions." It halves unfinished sessions at about 30 percent more output tokens, but leaves endings that list what remains.
- It asks less with that text: keep a hard confirmation step (permissions, hooks) for destructive actions.

## Approvals and caution

- Applies approval rules as written: name the exact actions a rule covers. A broad rule ("sending messages to people outside this conversation") held back half of its routine work.
- Treats "never" as absolute: write the exception into the rule ("ask for approval before deleting files", not "never delete files"); a separate line granting the exception changes nothing.
- Name the routine steps that need no approval (retries of calls safe to repeat); "act more freely" changes nothing.
- Cautions pile up from memory, notes, instruction files and reviewer conditions, mostly across several agents: delete those whose reason no longer holds, narrow stop conditions such as "stop at the first error", give absolute rules their scope and reason.

## Scope and code ownership

- Without an ownership statement, or with the code framed as someone else's, it adds to the existing structure, duplicates code and reports nearby problems instead of fixing them.
- For structural work add this sentence verbatim: "You are the owner and long-term maintainer of this codebase, and its design is up to you." Consolidation rises from under 10 to about 75 percent, output tokens by 70 to 80 percent, with unrequested tests, docs and occasional behaviour changes its closing summary omits: review the diff, never the summary alone.
- Leave the sentence out where the user owns the code and wants minimal change: a scope rule does not cancel it.

## Subagents

- Delegation follows the harness: rare with a plain subagent tool, ready where prompts invite it; at `xhigh`/`max` it starts subagents to review its own work. Strong as a planner and orchestrator over other models.
- Review standing "delegate" lines first. Only if it still over-delegates, rewrite the subagent tool's description: what a subagent adds to session cost (first), when delegation is and is not worth it, how to brief one.

## Output

- Goes quiet during long tool runs and may make its first tool call unannounced. Where a human watches add: "Before you start, say in a line what you're about to do; brief updates while you work help the user follow along. Close with a short recap that stands on its own (what you found, what you did, and what's next), so a reader who only sees the last message has the full picture." Where the harness cannot inject reminders, also: "Every few tool calls, give the user a one-line update on where things stand."
- For final reports and handoffs add under `# Communicating clearly`: "Write for an intelligent but low-context reader. The person reading has not seen your tool calls, your reasoning or the files you opened, and may be switching in from other work. Messages should generally be self-contained: the reader should understand what you mean without having to dig for other context. Put the key points in the first few sentences. Practice progressive disclosure in your sentence order, and do not use undefined references and ideas in line 1 that won't make sense until the reader reaches line 12. Use plain words, and write in clear, understandable full sentences. Do not use a term or abbreviation that you made up during the work. Say what the thing is in a way any reader would understand. Write mostly in the style of ASD-STE100 Simplified Technical English: short sentences, one idea per sentence, active voice, and consistently using the same word for the same thing. Use a paragraph of flowing prose where ideas connect, and keep bullets for lists of separate items. Leave out unnecessary details unless the reader asks and practice concision, but do ensure that your messages have the key context. Aim to make your user-facing text as human-readable and clear as possible."
- Follows style rules closely: a hard limit ("one instruction per sentence, in 20 words or fewer") makes prose choppy.

## Refusals

- Classifiers decline as `cyber`, `bio`, `frontier_llm`, `reasoning_extraction` or `general_harms`; benign security and life-science work trips `cyber` and `bio`. Fallback goes to Opus 4.8 or Opus 5 without its thinking: never pick `fable` for security audit work.

## Remove from prompts written for older models

- Lines telling it to think less or answer without deliberating.
- Standing instructions to delegate.
- A token budget written into the prompt: at `high`/`xhigh` removing a large one lowered cost at equal quality.
- The Opus 5.5 "treat that answer as done" lines: they stop it flagging mistakes in earlier answers.
- Hard style rules and accumulated cautions no longer needed.
- Effort values tuned on other models.
