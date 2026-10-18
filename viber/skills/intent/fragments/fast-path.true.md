Weigh the fast path first. A change it does not fit goes on to the bullets below.

- It fits only a change that stays in existing code, adds no subsystem, restructuring or domain concept, and is estimated at 2 tasks with code and 5 tasks in total at most.
- Tell a task with code from one without by the host project's own instructions, never by a fixed list of files: documentation and comments are without code; configuration and text the host declares its product are with code.
- Never for a returning draft or a `roadmap.md` the user points at, nor for an input whose `Attachment:` line points to a `findings.md` under `.temp/viber/code-auditor/` or a `review.md` under `.temp/viber/pr-feedback/`: that fix goes through a plan.
- Only under `branching.mode: off`, or when the start step settled "no branch" or "build on `current:`"; any other settled entry, "stay" included, keeps the full road.
- It skips `## Propose the spec shape` and `## Done`. Ask only what is still open, per `## The interview`. When `## Before the first question` finds nothing open, open with the settled line and go straight to the design, not to `## Done`.

The design:

- Show a short design in chat - what changes, in which files, how it is proven - and end on one `AskUserQuestion`: `Build it` or `Do not build`, a correction travelling through its free-text field.
- Build nothing before an explicit yes: `Build it`, carrying no correction. Never write a plan file or a run directory.
- `Do not build` -> stop; change nothing.
- A correction -> show the revised design and ask again.
- Any other reply (a question, a hesitation) -> answer it and ask again.
- A request for a full plan -> leave the fast path: propose the spec shape and continue the interview into `## Done`.

The build, after the yes:

- Make the change yourself, in this session.
- Then dispatch `Agent` with `subagent_type: viber:test-runner`, no `model:`, its prompt the one report path `.temp/viber/intent/test-runner.md`.
- `VERDICT: FAIL` -> read its report, repair the change, dispatch `test-runner` again.
- `VERDICT: SKIP` -> state in one line that no test suite ran.
- `VERDICT: DENIED` -> name the refused call from its `REASON:` line and stop, with no commit suggestion.
- The work, a repair included, needs more than 2 tasks with code or more than 5 in total -> stop at once, name in one line what exceeded which limit, leave the working tree as it is and suggest `/viber:intent`.
- `VERDICT: PASS` or `VERDICT: SKIP` -> close on one line suggesting `/viber:commit`. Never commit.
