# viber guide

How to use viber, command by command. For what viber is and why, see the
[project page](../README.md).

## Install

```
claude plugin marketplace add https://github.com/p2p2sp/viber --scope user
claude plugin install viber@p2p2 --scope user
```

Required: Node.js 22.18 or newer, for every viber skill and hook. Without it the session start hook says so and every skill refuses with one line.

Optional tools. A step that needs one skips with a note when it is missing:

| Tool | Used by |
| --- | --- |
| Playwright | `/viber:e2e` |
| the `gh` CLI | the GitHub steps, checked by `/viber:setup` |

`/viber:setup` adds a bare `Bash` allow to `.claude/settings.json`. `/viber:intent`,
`/viber:prototype`, `/viber:fixer` and `/viber:issue-create` rely on it for the script calls they
make after a later reply of yours. Without it, each of those calls asks for permission once.

## Before your first run

The build and test commands come from your project's `CLAUDE.md`. Without them, every agent in the
run has to guess, so write them down once. With no `CLAUDE.md` yet, run `/viber:memory`: it writes
a short root once, within 4000 bytes. After that the root is yours.

## Commands

A typical run is `/viber:setup` once, then `/viber:intent`. Each step names the next one.

### Start a change

| Command | What it does |
| --- | --- |
| `/viber:talk` | Talks a topic through with you, researches it on the web, checks the claims against trusted sources and ends on conclusions, never on code. |
| `/viber:intent` | Interviews you about an idea, in rounds, and hands the planner the confirmed summary as a file. |
| `/viber:fixer` | Traces a bug to its root cause, proves it with a failing test and hands it to the planner. |
| `/viber:prototype` | Turns a UI change into one HTML mockup in your project's own look, or three to choose from. |
| `/viber:ui-designer` | Holds an interface Claude builds or reviews to professional design standards. Starts on its own when the look is the goal (a new screen or page, a redesign, a UI review), not for a small functional change. |
| `/viber:issue-create` | Creates a GitHub issue from your issue form templates, after a preview and your yes. |
| `/viber:attach` | Attaches files or links you name to a GitHub issue as issue artifacts (`gh` 2.103 or later), and reports each link. |

### Ship it

| Command | What it does |
| --- | --- |
| `/viber:e2e` | Turns the build's QA scenarios into Playwright tests and runs them against your app. |
| `/viber:pr-create` | Opens a pull request for the current branch from your template, after a preview and your yes. |
| `/viber:pr-feedback` | Turns a pull request's unresolved review threads and the remarks outside them (Conversation comments, review bodies) into plan tasks. |
| `/viber:pr-feedback-reply` | Posts the replies of those tasks into the pull request once the fixes are pushed. |
| "commit" | Commits your changes, or only the paths you name, with a Conventional Commits message. |

### Keep the project healthy

| Command | What it does |
| --- | --- |
| `/viber:memory` | Reviews or extends your project's `CLAUDE.md` cascade. |
| `/viber:rules` | Reviews or extends your project's `.claude/rules/`, learning new rules from the `failures.md` of your archived runs. |
| `/viber:code-auditor` | Audits your code through one lens (bugs, security, performance, tests, design) over the current diff, one directory or the whole repository. |
| `/viber:extension` | Creates, with you, an agent of your own that runs at the close of every build. |
| `/viber:skill-designer` | Writes, audits and tunes your own Claude Code skills and agents, for the model they run on. Starts on its own. |

### Utilities

| Command | What it does |
| --- | --- |
| `/viber:setup` | Once per project, and again after an upgrade: config, ignore rules, permissions, `CLAUDE.md` check. |
| `/viber:handoff` | Saves the conversation as one file, so a fresh session picks up where this one stopped. |
### Command details

- **`/viber:talk`**: takes a topic or an opening thesis. Claude keeps in mind whether you want the
  current solution improved or another way, and when you look for another way it ranges over
  approaches that differ in kind instead of tweaking what exists. Before its first message it reads the
  code and docs the topic touches, and it asks only what the project leaves open, each question with a
  recommended answer a plain "yes" accepts. It takes positions and argues them,
  and it researches open questions on the web itself, splitting a question for in-depth analysis and
  comparing the approaches against your goal. A claim that carries weight is settled by a passage it read
  in a primary source, or goes to the `researcher` agent, the vendor's documentation and the
  standard's own text first, coming back confirmed, refuted, disputed or unverified with links.
  It reads GitHub read-only through `gh`: give it an issue or pull request (`#12` or a link) and its
  discussion becomes the topic; mid-talk it searches this repository's issues and pull requests and reads
  files and releases of other repositories, private ones your `gh` can reach included.
  The conclusions are yours to act on: `/viber:handoff` keeps them for a later session, and
  `/viber:issue-create` turns them into a task as an issue.
- **`/viber:intent`**: if you ask for a plan without an interview, viber suggests the interview
  first, and you decide.
- **`/viber:prototype`**: takes an issue reference or a plain description, and asks first whether
  you want one proposal or three. You refine it in conversation, then it goes on to `/viber:intent`,
  to the issue it started from, or both.
- **`/viber:issue-create`**: covers issues of any kind, bugs included. Say what it is about, or let
  it take that from the conversation. Name a parent issue (a number or a same-repository issue URL)
  and the new issue is attached under it as a sub-issue.
- **`/viber:pr-create`**: opens a pull request or a draft, titles it `[<n>] <issue title>` of its first issue (per `github.pr-title` with none), pushes only on your yes,
  assigns it to you as its author, and posts the run's `qa.md` as a QA comment on the run's issue
  (on the pull request when the run has none), once per run. For a pull request to a branch other than the default one,
  it creates the branch on GitHub linked to the first issue before the push, so the pull request shows in that issue's
  Development section; a branch already pushed cannot be linked, and it then tells you first to link it by hand.
  A build finished on its run branch, with no phase left, offers to run it.
- **`/viber:pr-feedback`**: `/viber:pr-feedback <pull request number or URL>` lists the unresolved review
  threads not yet answered and the remarks outside them, the pull request's Conversation comments and the
  bodies of submitted reviews (leaving out your own, bots' and answered ones), lets you pick which to act on and hands them to `/viber:intent`, so that every
  thread or remark becomes its own plan task whose done condition writes a reply. It runs only on the pull request's own
  branch, and the build commits there, never on a new run branch. It prints the reply command and posts nothing.
- **`/viber:pr-feedback-reply`**: `/viber:pr-feedback-reply <pull request number or URL>`, after the build, once
  the fixes are pushed (it stops while they are not). It lists the ready replies and the items still missing one,
  asks once and posts each reply: into its thread, or as a pull request comment quoting the remark, once per item.
  It never resolves a thread.
- **`/viber:code-auditor`**: `/viber:code-auditor [<lens>] [diff | diff:<sha> | <directory> | repo]`.
  Six lenses: `bugs`, `security`, `web-performance`, `runtime-performance`, `tests` and `design`;
  `performance` or `quality` picks a group and asks only which of its two lenses. Three scopes: the
  current diff (`diff`, or `diff:<sha>` to measure from a commit), one directory, or the whole
  repository (`repo`). Whatever you leave out, it asks. One agent maps the scope for the lens, hunters
  investigate it, and an independent critic tries to refute every finding without seeing the hunter's
  reasoning; the lenses that run code do so on a clean checkout. The result is `findings.md` under
  `.temp/viber/code-auditor/<run-id>/`, and your code is never edited. With at least one
  confirmed finding it ends on the next step, `/viber:intent <path of findings.md>`, which plans the
  fixes with `findings.md` as an attachment.
- **`/viber:extension`**: registers the agent in `build.extensions` with `parallel: false`.
- **`/viber:handoff`**: the file holds where to look, what is done, the decisions, what comes next
  and open problems. Name a directory (`notes/`) or a `.md` path to save it elsewhere, and add a
  loose prompt to steer the focus: `/viber:handoff notes/ focus on the migration`.
- **"commit"**: name an issue (`#42`) and it becomes the `Refs:` footer.

### Working from GitHub issues

With `github.issues` on, point `/viber:intent`, `/viber:fixer` or `/viber:prototype` at an issue:
`#42`, the bare number, or a link. It reads the issue instead of asking you to restate it.

- An interview that did not start from an issue can save its confirmed summary as a new one, built
  from your issue templates. `/viber:intent #42` then resumes it.
- A prototype that started from an issue can post its conclusions there as a comment, and the
  HTML mockup lands on the issue as an artifact (`gh` 2.103 or later). Where the artifact cannot be
  created, it tells you to attach the mockup in the browser.
- Either way, a prototype's conclusions carry on to `/viber:intent`, and the accepted mockup
  travels with the plan into the build as an attachment (see below).

### Attachments

A file under `.temp/` that a plan is built from, such as a prototype mockup or a code-auditor
`findings.md`, travels with the plan as an attachment. The plan lists it, and when the plan lands
the file is copied into the run directory's `attachments/`. The run's `spec.md` lists the copies
under `## Attachments`, and they reach the archive beside `outcome.md`. A task that needs one of
those files names it itself, so no coder reads a file its task does not need.

## How a run works

![How viber works](skills/setup/assets/viber-flow-en.svg)

The interview asks in rounds: the decisions whose prerequisites are settled go out in one
message, at most `planning.questions-per-round` of them (five by default), each with three concrete
options and a recommendation, and the confirmed summary is saved
as a file for the planner. The planner chooses the shape of the specification. A
judge reads the resulting plan against the summary you confirmed before you approve it: it reports
critical problems only, in at most two rounds, and everything else becomes a note. A plan written
outside the planner is only reviewed, under the same rules, through `planning.outside-plan-review`,
whatever number of files it names. Then the build runs
task by task, reviewing and committing each one, and finishes with one final review and your fast
tests plus the integration tests the change reaches. End-to-end tests stay with your CI and
`/viber:e2e` unless you explicitly ask for them.

Which task runs when is decided by a script: it lists the tasks whose dependencies are done, at most
ten at work at once, and a task marked `Exclusive` runs alone. A hook refuses a coder's edit of a
file that another unfinished task claims: the coder finishes what does not need that file and waits
for that task, which costs it no attempt. A collision with a task that has not started, or the second
collision of the same two tasks, puts them in sequence for the rest of the build and records that as a
decision. A skipped task claims no file. A coder answers each note of the
plan review in its task file with one line. A note is advice and never outranks a done clause or a
contract, and the reviewer fails a task over a note only where handling it broke one of them.

A task marked `TDD: required` is sealed three ways. Its coder shows the failing run of its new tests
before the first production edit, or the attempt fails. With `build.red-check` on, the build reruns
those tests in a separate checkout without the production change, and tests that pass there send
the task back. Its reviewer checks that the tests that failed are the task's new ones.

Tests go through the public contract alone. A domain rule is proven by a unit test and a use case by a component test on fakes, so most proof stays fast and in memory. Every external dependency gets a port, an in-memory fake and a contract test that the fake and the real adapter both pass. A build writes a test only for a critical path or a decision in the logic, one per regression, and none for an empty or missing input, a default value, a name, a data shape, what the compiler, type checker, linter or schema rejects or what a screen renders: a screen's decision is proven in the reducer, state machine or function holding it. Behaviour too plain to earn a test is checked by the reviewer reading the code. An integration test proves only what the real dependency reveals: its task writes it without running it, and the final run runs it once. A review finding on a test rule names the rule and covers every test of the task that breaks it, so one round of fixes clears the whole class. Later coders of the run get the test rules that earlier reviews of the run raised.

An idea too big for one cycle, such as a whole application, is split into ordered phases before any
detail question, and the interview covers every phase. Each phase gets its own plan and its own
build. A finished build names the next phase, which resumes from the decisions already made, and
nothing is stubbed in between. With GitHub issues on, each phase gets its own sub-issue under
one parent issue, and a phase that resumes is tied to its sub-issue.

The planner checks the size too. Before any plan text exists, its `plan-surveyor` agent maps the
change by search alone: its areas, the files it touches and an estimate of the tasks. When that map passes 30 tasks or 60
files, the planner stops and asks whether to split the change into phases or keep one plan of that
size; a split resumes the interview from the planner's own proposal. The planner also asks, one decision per question,
every decision its exploration of the code finds that the interview left open and that belongs to you,
such as a behaviour, a scope or a product choice. Implementation choices stay with it.

Its agents read your code and write the plan, so neither the code nor the plan text passes through
your session's context: each agent writes a file, a script puts the files together, and the session
only passes their paths on. A script cuts the map into slices, each small enough for one agent to
read once: at most 8 estimated tasks and 200000 bytes of files. A change that fits one slice goes to
one `plan-author` agent, which writes the whole plan. A larger change gets a frame first: the
`plan-architect` agent writes the specification and the contracts the slices share, and one
`plan-author` per slice then writes its tasks, in parallel, every line of them, and keeps notes of
the code facts it relied on. A script assembles the plan: it numbers the tasks, computes their order
from the files they list and the contracts they use, and checks that every acceptance criterion is
covered and every file referring to the change has a place. Before the plan is written, the planner searches your code for every reference to what the change modifies, moves or deletes,
and for the places that list or count the files beside one it adds; the plan adds nothing the interview left
unsettled.

The `plan-judge` agent reads the plan and your confirmed summary, and searches no code. A problem is
critical when the plan contradicts what you confirmed, or when a coder could not resolve it without
changing a done clause, a contract or a file outside its task. After each round you see one line:
the verdict and the number of critical problems and notes. The author of the text a critical problem
names writes the fix from its notes, without reading the code again, a script applies it, and the
second and last round reads only the text the fixes changed. A critical problem found in that round
is fixed once more and checked by script alone. No review finding asks you a question: every note
and every critical problem that could not be fixed is listed in the plan under `## Open items`,
which you see in one list before you approve the plan. A note belongs to one task, at most three per
task, and reaches that task's file when the build starts.

### When it decides for you

A task gets up to 5 attempts, each one model tier up. Where the build would otherwise stop and ask,
an arbiter agent picks one way forward from a closed list. That happens when:

- a coder stalls on attempts 1 to 4 and returns a `DECIDE:` line with its own ways forward
- a task is past its 5 attempts and its repair pass
- a baseline or final test run is red
- a recheck of the final review fails
- a commit is refused

A task past its 5 attempts gets a repair pass before the final review, and a deferred path no task
claims gets one too; the arbiter rules on a task past its attempts only after its repair pass fails.
A coder finishes every clause its dispute does not touch before it returns `DECIDE:`, the arbiter rules on a coder's first `DECIDE:` and the same coder continues with the ruling in the same attempt.

Every ruling goes into `rulings.md` with its reason and its cost if wrong, and the final summary
lists them. When the run is archived, the screen shows a short result and one closing sentence saying
whether `outcome.md` records a problem, plus, when a further phase is left, a sentence telling
you to continue the work and then the command that starts that phase. The full summary is in
`outcome.md` in the archive, along with every file the build left uncommitted and the reason, and one
`tokens:` line per agent role and model with its input, output, cache read and cache write counts. The
main session and the `closeout` agent are not counted. The summary also names the `rounds:` line (the plan review rounds), the `attempts:` line (every task that needed more than one attempt, with its count) and the `arbiter:` line (the number of rulings), and one `refused:` line per path a task commit refused because another task claims it, so such a path shows in the summary of a build that archives nothing too. `outcome.md` also holds one list, `## Notes and rulings`: every open critical problem of the plan, every note of the plan review with what its coder did with it, every ruling with its cost if wrong, every path a task commit refused because another task claims it, and every pair of tasks the build put in sequence. After a build you read that list, not the plan. The archive also keeps `failures.md`, the failure trail of the run,
which `/viber:rules` turns into rules when a failure repeats across runs. The close suggests
`/viber:rules extend` once convention failures stand in two runs, and `/viber:rules` removes the
convention entries it handled and every entry of another cause.

### When it stops to ask you

- a tool call is refused
- it finds another open run, or changed files no task claims
- nothing was committed for a task

## Configuration

`/viber:setup` writes `.claude/viber.yml`, with a comment on every key. Edit it to change:

- which review and close steps a build runs (switches)
- the model range a build runs with (tiers)
- whether a run works on its own git branch (branching)
- the titles of issues and pull requests, and the run directories

[Configuring viber](docs/configuration.md) is the full reference, including personal overrides in
`.claude/viber.local.yml`. [BRANCHING.md](BRANCHING.md) covers the branching schema.

## Where it writes

| Path | What it holds |
| --- | --- |
| `docs/_specs/<date>_<slug>/` | A run in progress, committed so a build resumes in a new session or on another machine |
| `docs/specs/<date>_<slug>/` | The archive: specification, test scenarios, rulings, failure trail (`failures.md`), build summary |
| `CLAUDE.md` files, `.claude/rules/` | What builds learned about your project, the rules they corrected, and the rules `/viber:rules` learned from `failures.md` |
| `.temp/viber/` | Scratch files and mockups, kept out of git |

[Where viber writes](docs/files.md) lists every file, including settings, extensions and what is
only ever added to.
