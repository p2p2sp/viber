# Branching

A project's `.claude/viber.yml` can describe more than one kind of run branch - each with its own
base, name pattern and pull request target - and let the type of the GitHub issue a run starts
from pick the right kind. One `branching:` schema is enough to express trunk based development,
GitHub Flow, GitLab Flow, Release Flow and GitFlow; every decision is made by `config.sh` and
`run-branch.sh`, so neither the planner nor the implementor carries stack-specific instructions.

No branching step ever fetches, pushes, merges or deletes: a branch is only created, switched to
and committed on. Only `/viber:pr-create` pushes it, on your yes (see Pull requests below).

## Modes

```yaml
branching:
  mode: off
```

- `off` - a run stays on the branch it started on, exactly as without this feature.
- `allowed` - the run may get its own branch: you pick the entry, or no branch, when the interview
  or diagnosis starts.
- `required` - a run always gets its own branch, and never commits onto the `base` of any work
  entry.

## When the branch is settled

Under `allowed` or `required`, `/viber:intent` and `/viber:fixer` settle the run's work entry
before they read any code:

- The entry is taken without a question when the issue type maps to one or exactly one entry is
  usable; otherwise you are asked which entry, `allowed` adding "no branch". When no entry is
  usable yet because every name needs an issue number, the planner settles it once the run has an
  issue (one saved at the end of the interview or diagnosis counts, and is settled again as the
  last bullet below says).
- HEAD is then checked against that entry's `base`: when HEAD is at another commit you are asked
  to switch to the base now, stay for now, build on the current branch, or abort, with how far the
  base is behind its remote. A base missing locally cannot be switched to, and uncommitted changes
  block the switch until you commit or stash them. `/viber:fixer` offers the same without "stay":
  its reproduction test is left uncommitted, which would block cutting the run branch from another
  commit when the plan lands.
  - "Stay" moves nothing and leaves the run branch to the entry's own name, cut from the base when
    the plan lands.
  - "Build on" makes no run branch: the build's commits land on the current branch. It is the only
    answer that pins the current branch.
  - Switching leaves the run branch to be cut from the base when the plan lands.
- Under `required`, building on the current branch is never offered on a detached HEAD or on any
  entry's base; `/viber:intent` still offers "stay" there, as the run gets its own branch.
- `/viber:intent` continuing a `roadmap.md` on a branch that is no entry's base builds on it
  without asking: the next part builds on the previous part's branch.
- `/viber:intent` started by `/viber:pr-feedback` makes no run branch and asks nothing: the fixes
  land on the pull request's own branch. Under `required` this holds only when that branch is no
  entry's base and HEAD is not detached; otherwise the usual questions follow.

- Once the entry is settled, a line announces the run branch: the entry, the branch pattern, its
  `base` and its pull request `target`, or that no run branch is made and commits land on the
  current branch.
- A run that saves a new issue after this step is settled again from that issue: an entry its type
  maps to replaces the earlier choice, "no branch" included (never a pull request's own branch), and is announced and base-checked;
  otherwise the earlier choice stays.

The chosen entry, and the current branch only after "build on", travel with the interview summary or the diagnosis
to the planner, which records the branch from them instead of asking again and announces the final
branch once. When the planner finds no entry usable yet and HEAD is on an entry's base, it asks
whether to continue on the current branch or stop; stopping ends it with nothing landed. Under
`required`, landing a plan whose run branch is any entry's base is refused.

## Work entries

Each kind of branch a project wants is one child of `branching.work`, keyed by a short name you
choose:

```yaml
branching:
  mode: required
  work:
    <entry key>:
      base: <branch>
      name: '<pattern>'
      target: <branch>
```

- `base` - the branch the new one is cut from.
- `name` - its name pattern, quoted since it opens on `{`. See Placeholders below.
- `target` - the branch its pull request would land on.

An entry key matches `[A-Za-z0-9._-]+`; `base` and `target` match `[A-Za-z0-9._/-]+`, may not
start with `-` or `/`, and may not hold `..`.

## Issue type mappings

`branching.issue-type-mappings` picks a work entry by the type of the GitHub issue a run starts
from (needs `github.issues: true` to have a type to read at all):

```yaml
branching:
  issue-type-mappings:
    <issue type>: <entry key>
```

Each mapping names an existing entry; an issue type with no mapping falls back to the single
usable entry when there is exactly one, otherwise the run is asked which entry to use.

## Placeholders

A `name` pattern is filled in from the plan: `{type}` (`fix` or `feature`), `{slug}` and
`{issue-number}`. A pattern holding `{issue-number}` needs `github.issues: true` - without it, or without
an issue on the run, that entry has no usable branch name and is offered no differently for a
manual choice, never silently.

## Refusal messages

`config.sh --branching` reports every configuration mistake as a readable `error:` line instead of
failing the whole load; a rejected work entry or mapping is dropped, everything else still
resolves:

- `branching.base and branching.name are no longer read - move them into a branching.work entry` -
  the old flat `base:`/`name:` pair directly under `branching:`, from before this schema.
- `work entry <key>: {issue} is now {issue-number}` - the old placeholder in a `name` pattern.
- `work entry <key>: missing <base|name|target>` - one of the three fields is absent.
- `work entry <key>: invalid <field>: <value>` - a field fails its own validation.
- `issue-type-mappings: <type> names no work entry: <key>` - the mapping is dropped, the entry it
  names does not exist.
- `no valid branching.work entry` - mode is `allowed` or `required` and no entry survived.

## One example per strategy

### Trunk based development, branching off

```yaml
branching:
  mode: off
```

Every run keeps committing on whichever branch you already checked out; nothing here decides that.

### Trunk based development, short-lived branches

```yaml
branching:
  mode: allowed
  work:
    main:
      base: main
      name: '{type}/{slug}'
      target: main
```

One entry, cut from and landing back on `main`; `allowed` leaves the choice to you only when the
start check finds you off `main`, where you can build on your current branch instead of getting a
run branch. Use `required` if every run should get a branch.

### GitHub Flow

```yaml
branching:
  mode: required
  work:
    main:
      base: main
      name: '{type}/{issue-number}-{slug}'
      target: main
  issue-type-mappings:
    bug: main
    feature: main
```

Every change gets its own branch off `main`, named after the issue it closes, and lands back on
`main` through a pull request.

### GitLab Flow, environment branches

```yaml
branching:
  mode: required
  work:
    feature:
      base: main
      name: '{type}/{slug}'
      target: main
    hotfix:
      base: production
      name: 'hotfix/{slug}'
      target: production
  issue-type-mappings:
    bug: hotfix
    feature: feature
```

Feature work is cut from and lands back on `main`; a production issue is cut straight from the
long-lived `production` branch instead. Promoting `main` through the environment branches
themselves is not a run branch and stays outside this schema.

### GitLab Flow, release branches

```yaml
branching:
  mode: required
  work:
    feature:
      base: main
      name: '{type}/{slug}'
      target: main
  issue-type-mappings:
    bug: feature
    feature: feature
```

Feature and fix work is cut from and lands back on `main` the same way. A release branch is named
`release/<version>` with the full semver number, such as `release/1.4.0`; cutting it, and
back-merging a fix into it, is part 2.

### Release Flow

```yaml
branching:
  mode: required
  work:
    feature:
      base: main
      name: '{type}/{issue-number}-{slug}'
      target: main
  issue-type-mappings:
    bug: feature
    feature: feature
```

Every change is cut from and lands back on `main`, named after its issue; cutting a release branch
per release and cherry-picking a fix onto it is part 2.

### GitFlow

```yaml
branching:
  mode: required
  work:
    feature:
      base: develop
      name: 'feature/{slug}'
      target: develop
    hotfix:
      base: main
      name: 'hotfix/{slug}'
      target: main
  issue-type-mappings:
    feature: feature
    bug: hotfix
```

Feature work is cut from and lands back on `develop`; a production issue is cut from `main`
instead. Release branches, their version numbers and back-merging a hotfix into `develop` are part
2.

## Pull requests

`/viber:pr-create` opens a pull request for the branch you are on, after a preview:

- The work entry comes from the run's `work:`, else from the one entry whose `name` pattern matches
  the branch; when that leaves several or none you are asked. Under `mode: off` you are asked for
  the target branch, the default branch first. The pull request lands on the entry's `target`.
- The title is `[<n>] <issue title>` of the first issue; with no issue it follows `github.pr-title`
  (`{type}`, `{summary}`, `{issue-number}` and `{entry}`). The
  body ends with `Closes #<n>` per issue when the target is the default branch, `Refs #<n>` otherwise.
- You answer create, create as draft or cancel. Only on create does it push the branch to its
  remote and open the pull request.
- A build that finishes on its run branch, with no roadmap part left, asks whether to open the
  pull request now and runs `/viber:pr-create` on your yes. A build ended on abort, or whose
  archive commit failed, only suggests the command; a build with a next roadmap part neither asks
  nor suggests.
- A run's `qa.md` is posted as a comment on the run's issue, or on the branch's pull request when
  the run has no issue, once per run, by the build close and by `/viber:pr-create`; a target that
  already holds the comment gets no second. `qa.e2e.md` is never posted.

### Template convention

The body comes from the first of these that exists, and viber never writes under `.github/`:

- `.github/PULL_REQUEST_TEMPLATE/<entry key>.md` - the template of that work entry.
- `.github/pull_request_template.md` - the template of every entry.
- Neither - the sections Summary, Changes and Testing.

`{type}`, `{summary}`, `{issue-number}` and `{entry}` are filled in wherever they stand in a
template. A section that nothing in the run's files, the commits or the conversation answers reads
`_No response_`, and HTML comments in the template are dropped.

Feature, saved as `.github/PULL_REQUEST_TEMPLATE/feature.md`:

```markdown
## Summary

{summary}

## Changes

## Testing

## Checklist

- [ ] Tests added or updated
- [ ] Documentation updated
```

Hotfix, saved as `.github/PULL_REQUEST_TEMPLATE/hotfix.md`:

```markdown
## Hotfix: {summary}

## Impact

## Cause and fix

## Rollback

## Checklist

- [ ] Reproduced on production
- [ ] Fix verified
```

## What part 2 adds for releases

This schema covers the branch a run lands on. A later part adds `releases:` and `version:`
configuration, the `{version}`, `{issue-title}`, `{base}` and `{target}` placeholders, and cutting
or back-merging a release branch itself. None of that exists yet: every example above is the full,
current configuration for its strategy.
