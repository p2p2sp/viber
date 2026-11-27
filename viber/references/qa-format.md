# QA document formats

Two documents per build, both in the build's own run directory: `qa.md`, which a person performs by hand, and `qa.e2e.md`, which an agent turns into Playwright tests.

## Scenario IDs

- `QA-<nn>`, zero-padded, sequential from `QA-01`, numbered once per build across both documents together. Past 99 the numbering keeps counting.
- Exactly one tag per ID, `ui` or `api`, never written as a field: it is expressed by where the entry lands - `ui` in `qa.md` and under `## UI scenarios`, `api` under `## API scenarios` only. A requirement observable both on screen and through an endpoint yields two scenarios and two IDs, one of each tag, never one scenario carrying both.
- The same ID names the same case in both documents and in the generated test's title, and `Covers:` cites its requirement as `R<n> <requirement text>`.

## Acceptance document `qa.md`

Human-only, `ui` scenarios only - manual API testing is out of scope. Written whole, every heading, label and column name included, in the language the run's own specification is written in, never in the English of this plugin's files; the IDs are never translated.

```
# <build title>

## What changed
<2-3 plain sentences: what a person can now do, or what behaves differently. No file names.>

## Preparation
- Environment: <URL>
- Accounts: <role> (<login>)
- Data: <what must already exist before the first scenario>

## QA-01 <scenario title>
- [ ] <the word "done" in the document's language>

Covers: R<n> <requirement text>

Preconditions: <one sentence - the state the tester starts from>

| # | Step | Expected result |
| --- | --- | --- |
| 1 | <one action> | <one observable outcome> |

## Out of scope
- <what this document deliberately does not cover, and why>
```

Those sections, in that order; a scenario block is the unticked checkbox a tester ticks once the scenario is performed, `Covers:`, preconditions, step table, nothing between them but the one blank line separating each, without which Markdown folds the lines into the checkbox's label. One row is one action and one outcome a tester can see: a step joining two actions with "and" is two rows, a result nobody can observe is not a row. A preparation value the project's own instructions do not give reads "settle with the team" in that same language, never a guess and never a placeholder.

## Handoff file `qa.e2e.md`

Machine-facing. Headings and field names are fixed English whatever language `qa.md` is in - an agent reads them, not a person; scenario titles and requirement text keep the wording they have there.

```
Base: <base URL of the running application | unknown>
Launch: <command that starts the application | unknown>
Accounts: <role> <login> - <where the passwords live> | unknown

## UI scenarios

### QA-<nn> <scenario title>
- Covers: R<n> <requirement text>
- Role: <role the scenario runs as | unknown>
- Route: <path the scenario starts on>
- Seed: <what must exist and how to create it, as a request | none>
- Steps:
  1. <one action>
- Assert: <the observable outcome the test proves>
- Files: <repo-relative source paths the scenario exercises>

## API scenarios

### QA-<nn> <scenario title>
- Covers: R<n> <requirement text>
- Endpoint: <METHOD> <path>
- Auth: <how the request authenticates | none | unknown>
- Request: <body or query | none>
- Expect: <status plus the response facts asserted>

## Not automatable
- QA-<nn> - <reason no test can drive this scenario>

## Out of scope
- R<n> <requirement text> - <reason it has no scenario>
```

The three header lines always come first, in that order. A UI entry carries all seven fields, an API entry all five, each on its own line in the template's order; nothing to seed is `none`. A section with no entries is left out rather than written empty, and an ID under `## Not automatable` gets no scenario entry and no automation line.

## Automation

Written by the e2e run alone, never when the handoff is created: one line per processed ID, never two. The section is created by the first processed ID and lives at the end of the file.

```
## Automation
- QA-<nn>: file <repo-relative spec path>
- QA-<nn>: blocked - <reason the application, not the test, prevents a green run>
```

`file` means the test ran green locally at least once. `blocked` means the application prevented it and the generated file was deleted, so a `blocked` line never names a path. A re-run skips every `file` ID, retries every `blocked` one, and treats an ID with no line as pending.

## Never write these

- In `qa.md`: an execution-status column or field beyond each scenario's one unticked checkbox, automation vocabulary (Playwright, locator, selector, `data-testid`, `.spec.ts`, a test directory, a CI job), a file path, a code identifier.
- An invented value in the handoff. A value the code does not establish is the literal `unknown`, which the e2e run resolves against the running application; an invented one is a test that proves nothing.
