# Synthesis - run file, report schemas, verdict file, fill

## Contents

- Run file
- Hunter report schema
- Claim sidecar schema
- Critic verdict file
- Fill rules

## Run file

The one description of a run, at `.temp/viber/code-auditor/<run-id>/run.md`. `frame.sh` writes it and `keep-units.sh` appends the `## Map` section after the map gate. Each line starts at column 0:

```
Lens: <lens>
Lens file: <absolute path of the lens file>
Scope: diff | repo | <root-relative directory>
Target root: <absolute repository root>
Base: <BASE value from diff-files.sh>

## Changed files
<root-relative path, one per line>

## Map
<map.md verbatim>
```

## Hunter report schema

A hunter files at most three findings, each in `<hunt id>-<k>.md` under the run's `reports/`, `k` 1 to 3. The file opens with a head block of six tagged lines, in exactly this order, so the whole pool can be ranked without opening a single report body:

```markdown
# <short title>
LOCATION: <path>:L<start>-L<end>
CLASS: <angle slug>: <specific class>
SEVERITY: <0.0-10.0>
CONFIDENCE: low | medium | high
HUNT: <hunt id>
```

Then the body: four sections in this order, each heading written at the start of its own line.

- `## Root cause` - 2-4 sentences: what is actually wrong and why.
- `## Reproduction` - concrete steps or a runnable PoC: input, command, expected vs actual; for a `Worktree: none` lens, the cited locations and the evidence.
- `## Verification` - how it was proven by the lens's `## Verify`: oracle output, crash trace, failing test, quoted evidence.
- `## Suggested fix (sketch)` - not a PR, just the shape of the fix and what it must not break.

A hunter with nothing real writes `<hunt id>-0.md` whose entire body is `NO FINDING` plus one `checked: <line>` on what it examined. Keep these: they are coverage evidence.

## Claim sidecar schema

Each filed report gets one sidecar next to it, `<hunt id>-<k>.claim.md`. The sidecar is the claim with the reasoning stripped out, and it is the only thing the critic is ever given. Three parts, in this order, and nothing else:

1. `LOCATION: <the report's LOCATION line, verbatim>`
2. `CLASS: <the report's CLASS line, verbatim>`
3. One section headed `## Reproduce` (that heading at the start of its own line) carrying what the lens's `## Verify` replays: the input, the exact command to run inside the clean checkout and the observable symptom (an exit code, an output line, a failing test name); for a `Worktree: none` lens, the cited locations and the evidence.

The sidecar never carries `CONFIDENCE`, `SEVERITY`, `HUNT`, a root cause, a fix sketch, or one sentence explaining why the code is wrong. A symptom the critic can observe, never a conclusion it can inherit.

A `NO FINDING` report has no sidecar.

## Critic verdict file

Each critic writes `<ws>/verdicts/<hunt id>-<k>.md`:

```
VERDICT: VERIFIED | REFUTED | PARTIALLY VERIFIED | INCONCLUSIVE
COMMAND: <the exact command or check performed>
OBSERVED: <what was seen>
SEVERITY: <0-10>
```

- `VERIFIED`: the claim reproduced as filed.
- `PARTIALLY VERIFIED`: part of the claim held; `OBSERVED` names the sub-claims that did.
- `REFUTED`: the claim did not reproduce.
- `INCONCLUSIVE`: no oracle settled the claim; `OBSERVED` names the missing oracle.

A finding is confirmed when its verdict is `VERIFIED` or `PARTIALLY VERIFIED`.

## Fill rules

`synthesize.sh` writes `findings.md` and leaves one `<!-- fill -->` line in each full entry it has not filled yet. For each `entry:` line it printed:

- Replace the `<!-- fill -->` line with three short paragraphs lifted from the report: root cause, reproduction, fix sketch.
- A `PARTIALLY VERIFIED` entry keeps only the sub-claims its `observed:` value confirms.
- An `INCONCLUSIVE` entry's `STATUS:` line keeps its text, with the missing oracle named in place of the `<!-- oracle -->` mark.
- A merged entry lists several reports: lift the clearest reproduction of the group.
- Open each report once, whole, only for its entry. No other report is opened.
