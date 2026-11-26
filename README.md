<h1 align="center">viber</h1>

<p align="center">
  A Claude Code plugin that plans a change with you, then builds it while you do something else.
</p>

<p align="center">
  <a href="#install">Install</a> | <a href="viber/README.md">Full guide</a>
</p>

<p align="center">
  <a href="https://github.com/p2p2sp/viber/actions/workflows/ci.yml"><img src="https://github.com/p2p2sp/viber/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
</p>

![viber building 27 tasks with 20 coding agents working in parallel in Claude Code](docs/viber-tasks.png)

<p align="center"><sub>27 tasks, 20 agents at work, each on the model its task needs.</sub></p>

## Why viber

### It plans with you first

Before it works alone, viber works through the change with you. It asks in short rounds, each question with concrete options and a recommendation, and says so when an answer looks weak. The planner then reads your code and asks only what the interview left open and the code cannot answer. You approve the finished plan, so every decision the build needs is settled before you leave the computer.

### It runs without you

Approve the plan and walk away. A task that fails gets up to five attempts, each on a stronger model. Where a build would normally stop and wait for you, an arbiter agent picks a way forward and writes down why, so you review one decision later instead of babysitting the whole run.

### It works in parallel

Tasks that do not depend on each other are built at the same time, up to ten at once, each by its own coding agent. A script decides which tasks are ready, and a hook keeps each coder out of the files another unfinished task claims. A plan of 27 tasks does not wait in a queue of 27.

### It saves your tokens

Each task gets the cheapest model that can do it, within a range you set, and climbs to a stronger one only when it fails. The bookkeeping costs little too: counting, validating a plan, tracking review rounds and deciding the next step are done by scripts. One script call does the whole job and answers with the next instruction, so the model acts on it instead of spending tokens working it out. Your Claude Code usage limits last longer.

### It learns your project, in two layers

What a build learns about an area of your code goes into that area's `CLAUDE.md`, so the next run starts with the knowledge instead of rediscovering it. Coding conventions go into `.claude/rules/`: a build corrects the rules it proved wrong, and a mistake that coders repeat across builds becomes a new rule they follow from then on. You explain less with every run.

## How a change goes

| | You | viber |
| --- | --- | --- |
| **1. Describe** | Say what you want with `/viber:intent`, or report a bug with `/viber:fixer` | Asks a few questions at a time, each with options and its recommendation |
| **2. Approve** | Read the plan and its open items and say yes | Writes the plan from your code and has a judge check it against what you confirmed first |
| **3. Build** | Nothing. Go do something else | Builds it task by task, reviews and commits each one, runs your tests at the end |
| **4. Learn** | Nothing | Updates its memory and rules, so the next change needs less explaining |

The plan is reviewed before you see it, in at most two rounds that report critical problems only, each task is checked before its commit, by a reviewer or by your own tests, and the whole build is reviewed before it ends. Plan and progress are committed as the build goes, so an interrupted build picks up in a new session or on another machine.

## More than the main loop

| When you want to | Run |
| --- | --- |
| Talk a topic through, checked against trusted sources, before you decide anything | `/viber:talk` |
| See a UI change as a mockup before anyone builds it | `/viber:prototype` |
| Find out whether a side-project idea is worth building | `/viber:idea-validator` |
| Audit code for bugs, security, performance or test quality | `/viber:code-auditor` |
| Turn pull request review comments into fixes, then post the replies | `/viber:pr-feedback` |
| Open an issue or a pull request from your own templates | `/viber:issue-create`, `/viber:pr-create` |
| Turn a build's test scenarios into Playwright tests | `/viber:e2e` |
| Write or tune your own Claude Code skills and agents | `/viber:skill-designer` |
| Continue tomorrow in a fresh session | `/viber:handoff` |
| Attach a file or link to a GitHub issue as an issue artifact | `/viber:attach` |

Every command is described in the [full guide](viber/README.md).

## Install

```
claude plugin marketplace add https://github.com/p2p2sp/viber --scope user
claude plugin install viber@p2p2 --scope user
```

Then, in your project, run `/viber:setup` once and start your first change with `/viber:intent`. `/viber:help` opens the guide in your browser.

## The whole flow

Every step from an idea to an archived build, including the optional ones.

<details>
<summary>Show the diagram</summary>

![The viber flow from an idea to committed code](viber/skills/setup/assets/viber-flow-en.svg)

</details>

## Good to know

- viber runs in Claude Code only, and its issue and pull request steps work with GitHub through the `gh` CLI.
- It takes your build and test commands from your own `CLAUDE.md`, whatever language you work in.
- It changes fast. Run `/viber:setup` again after an upgrade.
- `--scope user` makes the plugin available in all your projects. Drop it to install for the current repository only.
- A plan written outside viber's planner is only reviewed, through `planning.outside-plan-review`.

<details>
<summary>Requirements</summary>

| Needed for | Tool |
| --- | --- |
| GitHub issues and pull requests | the `gh` CLI |
| every viber skill and hook | Node.js 22.18 or newer |
| `/viber:idea-validator` | web access |
| `/viber:e2e` | Playwright |

</details>

## Built with viber

viber is developed with viber. [`docs/specs/`](docs/specs/) holds 75 of its own archived builds, each with its plan, its decisions, the places where its agents failed and its final summary.

## Contributing

The maintainers set the direction, so pull requests are not accepted. Bug reports and ideas are welcome: [open an issue](https://github.com/p2p2sp/viber/issues/new/choose). More in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE). Built and maintained by [P2P2](https://github.com/p2p2sp).
