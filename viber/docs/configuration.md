# Configuring viber

`/viber:setup` writes `.claude/viber.yml`, with a comment on every key. This page is the full
reference. Back to the [viber guide](../README.md).

## How the file works

- Switches sit in three groups: `planning:`, `build:` and `github:`. A switch counts only inside
  its group: one written at column 0 or under another group reads as off.
- Only `true` counts as on. Turn a switch off with `false` instead of deleting it.
- Without the file, every switch is off.
- Run `/viber:setup` again after an upgrade. It merges in any switch the new version added, moves
  a switch written outside its group into it, and keeps every value you set. A session start tells
  you when the file's `schema:` number says that run is needed.

## Switches

`/viber:setup` turns eight of the eleven on and `build.qa`, `github.issues` and
`build.baseline-tests` off.

| Switch | Default | When on |
| --- | --- | --- |
| `planning.adr` | on | A decision worth keeping becomes an architecture decision record in `docs/adr/`. |
| `planning.plain-plan-review` | on | A plan written in plain plan mode, without the planner, must pass a review before plan mode can be left. |
| `planning.fast-path` | on | A small, well-scoped change to existing code gets a short design in chat instead of a plan. |
| `build.baseline-tests` | **off** | Takes `off`, `fast` or `full`. Runs your tests before the first task, so the build repairs only the failures it caused. |
| `build.final-review` | on | One reviewer checks the whole build's diff after the last task, and a coder fixes what it finds. |
| `build.memory` | on | The build closes by updating your `CLAUDE.md` files below the root. |
| `build.rules` | on | The build closes by recording a convention it confirmed in `.claude/rules/`. |
| `build.qa` | **off** | The build closes by writing test scenarios that `/viber:e2e` can automate. |
| `build.cleanup` | on | The build closes by archiving the run with its summary and dropping the working files. |
| `build.red-check` | on | A `TDD: required` task's tests must fail in a separate checkout without the task's production change before the task is reviewed or committed. |
| `build.extensions` | empty | Not a switch: a map of your own agents, run at the close of a build. |
| `github.issues` | **off** | Commands can start from a GitHub issue, and an interview can save its conclusions as a new one. |

### Switch details

- **`planning.fast-path`**: `/viber:intent` shows the design and builds it only after your
  explicit yes, with no plan file and no run directory. A fix of code-audit findings or pull
  request review threads never takes the fast path: it is always built through a plan.
- **`build.baseline-tests`**: records what already fails before the first task. `fast` runs the
  unit and component tests, `full` every layer but end-to-end. `setup` rewrites an older `true` to
  `full` and `false` to `off`.
- **`build.final-review`**: runs after every task is committed and before the final test run. It
  looks for what per-task review and the test suite cannot see. A reviewer rechecks the fix; after
  a failed recheck, the arbiter rules on committing the fix as it stands, recorded in
  `rulings.md`. The build summary lists each finding, what was wrong and what the fix changed.
- **`build.memory`**: the root `CLAUDE.md` stays yours. The build only suggests changes to it.
  When the specification records the root cause of a fixed defect, it is written to the nearest
  `CLAUDE.md` as the first trap of the run, ahead of every other fact.
- **`build.rules`**: a build never compacts, splits or moves your existing rule files: it adds
  only what passes the admission gate, even over the size cap, and reports each file left over
  budget. `/viber:rules` brings those files back under it.
- **`build.cleanup`**: first notes anything the build delivered that the specification does not
  promise, then records every file the build left uncommitted with its reason and commits those
  left without a deliberate reason. The close then prints one sentence saying
  whether `outcome.md` records a problem. What it archives is described in [Where viber writes](files.md#the-archive).
- **`build.red-check`**: the third part of the TDD seal. With the switch on or off, the coder of a
  `TDD: required` task must show its tests failing before its first production edit, and the
  reviewer checks that the failing tests are the task's new ones. With it on, the build then runs
  the task's tests in a git worktree of `HEAD` in the system temp directory, holding the task's
  test files but not its production change: tests that pass there send the task back to its coder,
  and a check that cannot run is reported to the task's reviewer. A `TDD: required` task is always
  reviewed, whatever this switch reads. Two settings tune it:
  - `build.red-check-tests`: what counts as a test file. Default: `__tests__/ tests/ test/
    *.Tests/ *.UnitTests/ *.IntegrationTests/ *.test.* *.spec.* test_*.py *_test.py *_test.go
    *Test.java *Test.kt conftest.py testdata/ __mocks__/ __fixtures__/ fixtures/ jest.config.*
    vitest.config.*`. An entry ending in `/` matches any directory of the path, any other a file
    name.
  - `build.red-check-links`: directories linked from your working tree into the worktree at the
    same path, so the tests run without an install. Default: `node_modules`.
  - Both take entries separated by spaces, unquoted; a `#` after a space starts a comment. Empty,
    a comment only or a missing key reads as the default.
- **`build.extensions`**: one entry per agent from your project's `.claude/agents/`, run in that
  order just before the run is archived. An entry runs alone unless it holds `parallel: true`:
  consecutive such entries run together in one message, as one step. Empty runs none.
  `/viber:extension` creates an agent and its entry for you.
- **`github.issues`**: `/viber:intent`, `/viber:fixer` and `/viber:prototype` can start from an
  issue's number or link. `/viber:prototype` can post its conclusions to the issue it started from.
  `/viber:triage` can fetch from and publish to an issue, not only work on pasted text.

## Personal overrides

To change a few settings for yourself only, create `.claude/viber.local.yml` in the same layout.

- It overrides four keys and nothing else: `tiers.min`, `tiers.max`, `build.baseline-tests` and
  `github.issues`.
- An empty or invalid value is ignored.
- The file stays out of git (`/viber:setup` adds it to `.gitignore`), and `/viber:setup` never
  creates or changes it.

## Model tiers

The `tiers:` group sets the model range a build runs with: `haiku`, `sonnet`, `opus` or `fable`.

```yaml
tiers:
  min: haiku
  max: opus
```

- Every task, review and retry stays inside the range: `min: sonnet` never runs Haiku, and
  `max: sonnet` never runs Opus.
- Fable runs only when you name it: `max: fable` lets retries climb to it, and `min: fable` with
  `max: fable` runs the whole build on it.
- A held task's repair pass, run after its 5 attempts and before the final review, runs at
  `tiers.max`.
- Planning is not affected: it runs on your session's model.

## Titles and directories

| Key | Default | Sets |
| --- | --- | --- |
| `github.issue-title` | `'{summary}'` | The title of an issue viber opens |
| `github.pr-title` | `'[{issue-number}] {summary}'` | The title of a pull request viber opens |
| `directories.runs` | `_specs` | The directory under `docs/` for a run in progress |
| `directories.specifications` | `specs` | The directory under `docs/` for the archive |

## Branching

The `branching:` group says whether a run works on its own git branch.

```yaml
branching:
  mode: off
  work:
    main:
      base: main
      name: '{type}/{slug}'
      target: main
```

| `mode` | Meaning |
| --- | --- |
| `off` | Stay on the branch the run started on. |
| `allowed` | A run may get its own branch. |
| `required` | A run always gets its own branch, never an entry's base. |

- Several kinds of branch can be described, each with its own base, name pattern and pull request
  target. The type of the GitHub issue a run starts from picks the kind, through
  `issue-type-mappings`.
- Under `allowed` and `required`, the entry is settled when the interview or diagnosis starts,
  before any code is read, with an offer to switch to its base first.
- No branching step fetches, pushes, merges or deletes. Only `/viber:pr-create` pushes, on your
  yes.

[BRANCHING.md](../BRANCHING.md) has the full schema, one example per branching strategy (trunk
based development, GitHub Flow, GitLab Flow, Release Flow and GitFlow), and the pull request
template convention `/viber:pr-create` reads.
