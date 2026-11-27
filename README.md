<h1 align="center">--- viber ---</h1>

<p align="center">
  <a href="https://github.com/p2p2sp/viber/releases/latest"><img src="https://img.shields.io/github/v/release/p2p2sp/viber" alt="Latest release"></a>
</p>

<p align="center">
  A lightweight Claude Code plugin that takes a change from an interview to committed code.
</p>

<p align="center">
  <a href="#install">Install</a> | <a href="#more-than-the-main-loop">Commands</a> | <a href="#the-whole-flow">The whole flow</a>
</p>

![A build of 27 tasks in Claude Code, with coding agents working in parallel](docs/viber-tasks.png)

<p align="center"><sub>A build in progress: independent tasks side by side, each on the model its task needs.</sub></p>

## Why viber

### It plans with you first

Before it builds anything, viber interviews you. It asks questions, each with concrete options and a recommendation, and looks facts up in your code rather than asking you for them. The interview ends in an understanding that you confirm, so every decision the build needs is settled before any code is written.

### It sizes the process to the change

Not every change needs a spec. When the interview ends, you pick the path:

| Path | What happens | Ends with |
| --- | --- | --- |
| Spec > Plan > Build | A reviewed spec, a reviewed plan of numbered tasks, a build with one commit per task | Committed code and an archived run |
| Short plan > Build | A short plan you approve, a build in a fresh context, a code review | A committed change |
| Build now | A build in the same session, no plan and no review | A committed change |

### It splits a big change into parts

When the interview settles more than 10 required behaviours, viber proposes splitting the change into parts of at most 10 each. Each part is a vertical slice: once it is built, the project builds, the full test suite passes and at least one new behaviour can be seen. Each part gets its own spec in its own directory, `<stamp>_<slug>-p<n>-of-<N>`, and then its own plan and build. Only the directory name records the split, so the agents never see it. The planner refuses a part until the one before it has been built and archived. A finished part's build ends by naming the spec of the next one, which you start with `/viber:planner <spec>` in a new session. A split change always takes the Spec > Plan > Build path.

### It runs without you

Approve the plan and walk away. A script decides every step of the build: which task starts, what its coder is handed, whether a review passed, when a task is committed. A task that fails its review gets up to two fix rounds. One that still cannot pass is held, the tasks that depend on it are skipped and the rest of the plan goes on, so you come back to one summary instead of a stopped build.

### It works in parallel

Tasks that share no file and do not depend on each other are built at the same time, up to five at once, each by its own coding agent. The plan's script sorts the tasks into these waves.

### It saves your tokens

Each task runs on the model the plan derived for it: haiku for a task with no runtime code, sonnet by default, opus for a hard one. Checking a spec or a plan, ordering tasks, cutting a task file and tracking review rounds are done by scripts. A skill never reads what its agents wrote: files travel by path and an agent answers with one fixed line, so the main session stays small through a long build.

### It learns your project

What a build learns about an area of your code goes into that area's `CLAUDE.md`, capped at 600 bytes of growth per build, so memory stays short enough to be read. A rule under `.claude/rules/viber/` that the build made false is corrected. A spec that records a decision leaves a decision record in `docs/adr/`.

## How a change goes

The full path, step by step:

| | You | viber |
| --- | --- | --- |
| 1. Describe | Say what you want with `/viber:intent`, or report a bug with `/viber:fixer` | Asks a few questions at a time, each with options and its recommendation |
| 2. Confirm | Confirm the understanding, then the spec | Writes the spec from what you settled, checks it with a script and has an agent review it |
| 3. Approve | Read the plan and say yes | Maps your code and tests, writes the tasks and has the plan reviewed before you see it |
| 4. Build | Nothing. Go do something else | Builds task by task, reviews and commits each one, reviews the whole build, runs your tests |
| 5. Learn | Nothing | Updates the project memory and rules, writes the summary and archives the run |

The plan is reviewed before you see it and reports critical problems only, and a hook refuses to leave plan mode on a plan that did not pass. Each task is checked against its own definition of done before its commit. The run's state is committed as the build goes, so an interrupted build picks up in a new session or on another machine.

A bug goes through `/viber:fixer`, which finds the root cause, proves it with one failing test and never fixes it itself: the fix is built from a short plan you approve.

## More than the main loop

| When you want to | Run |
| --- | --- |
| See a UI change as a mockup before anyone builds it | `/viber:ui-prototype` |
| Audit code for bugs, security, performance, tests or design | `/viber:code-auditor` |
| Turn a build's QA scenarios into Playwright tests | `/viber:e2e` |
| Review a pull request and post the findings on their lines | `/viber:pr-review` |
| Turn pull request review comments into fixes, then post the replies | `/viber:pr-feedback`, `/viber:pr-feedback-reply` |
| Open an issue or a pull request from your own templates | `/viber:issue-create`, `/viber:pr-create` |
| Attach a file or link to a GitHub issue | `/viber:attach` |
| Verify, shorten and complete the `CLAUDE.md` memory or the project rules | `/viber:memory`, `/viber:rules` |
| Run an agent of your own at the close of every build | `/viber:extension` |
| Write or tune your own Claude Code skills and agents | `/viber:skill-designer` |
| Hold a screen to professional UI standards | `/viber:ui-designer` |
| Commit the change with a message written for you | `/viber:commit` |
| Continue tomorrow in a fresh session | `/viber:handoff` |

## Install

```
claude plugin marketplace add https://github.com/p2p2sp/viber --scope user
claude plugin install viber@p2p2 --scope user
```

Then, in your project, run `/viber:setup` once and start your first change with `/viber:intent`.

## The whole flow

Every step from an idea to an archived build, the short and the direct path included.

<details>
<summary>Show the diagram</summary>

![The viber flow from an idea to committed code](docs/viber-flow.svg)

</details>

## Good to know

- viber runs in Claude Code only, and its issue and pull request steps work with GitHub through the `gh` CLI.
- It takes your build and test commands from your own `CLAUDE.md`, whatever language you work in.
- It builds on the branch you are on and never creates one.
- The full path commits as it goes. The short and the direct path commit once the tests pass, and name every file they left uncommitted: one you had changed before the build, or one no agent reported. `/viber:memory`, `/viber:rules`, `/viber:extension` and `/viber:e2e` leave their result in your work tree.
- Its few switches live in `.claude/viber.yml`: `build.qa` (QA scenarios at the close of a build), `build.rules` (the rules step), `build.extensions` (your own agents) and `directories` (where runs and archives live under `docs/`).
- `--scope user` makes the plugin available in all your projects. Drop it to install for the current repository only.
- viber 1.0 is a lighter rewrite of the 0.x line: the same flow with much shorter instructions for its skills and agents, fewer switches and no guard hooks.

<details>
<summary>Requirements</summary>

| Needed for | Tool |
| --- | --- |
| every viber skill and hook | Node.js 22.18 or newer, bash 3.2 or newer |
| GitHub issues and pull requests | the `gh` CLI |
| `/viber:e2e` | Playwright, installed in your project |

</details>

## Built with viber

viber is developed with viber. [`docs/specs/`](docs/specs/) holds its own archived builds, each with its spec and its outcome, and [`docs/adr/`](docs/adr/) the decisions they recorded.
