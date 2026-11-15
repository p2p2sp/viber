# Synthesis - run file, verify, dedupe, score

## Contents

- Run file
- Hunter report schema
- Claim sidecar schema
- Critic verdict
- Deduplicate
- Severity
- findings.md (final output)
- Variant wave
- What the skill reads

## Run file

The one description of a run, at `.temp/viber/code-auditor/<run-id>/run.md`. The skill writes it in Frame and appends the `## Map` section after the map gate. Each line starts at column 0:

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

## Critic verdict

Each critic returns `VERDICT`, `COMMAND`, `OBSERVED` and a 0-10 `SEVERITY` in its final message, never in a file. Fold each verdict into `findings.md` like this:

- VERIFIED - keep the finding as filed; `CONFIDENCE` stays as filed. Adopt the critic's `SEVERITY` as the filed severity and note the adopted value in the entry.
- PARTIALLY VERIFIED - keep only the sub-claims the critic's `OBSERVED` confirms, drop the rest; `CONFIDENCE` stays as filed. Adopt the critic's `SEVERITY` as for VERIFIED.
- REFUTED - drop the finding entirely. It does not appear in `findings.md`, not even at low severity and not in the further-findings list.
- INCONCLUSIVE - keep the finding; `SEVERITY` stays as filed. Lower `CONFIDENCE` by one step (high -> medium, medium -> low); an entry already at low stays low. Name the missing oracle alongside the entry so the gap reads as honest coverage.
- No `VERDICT:` line after the retry: `INCONCLUSIVE` under the rule above, reason `critic returned no verdict` in place of a missing-oracle name.

A finding is confirmed when its verdict is `VERIFIED` or `PARTIALLY VERIFIED`.

## Deduplicate

Group reports by root cause, not by file: the same defect (a shared unchecked helper, say) often surfaces from several hunts. Group on what is already in hand, the head lines and the verdict blocks: the same `CLASS`, an overlapping or adjacent `LOCATION`, the same symptom in the critics' `OBSERVED`. Merge such reports into one finding, list all affected locations, keep the highest severity and the clearest `## Reproduction`.

A merged group is one finding everywhere downstream: it takes one slot against the cap, it carries the strongest verdict of the group, and it is named by the first `<hunt id>-<k>` of its members in hunt order (below), which also places it in a tie-break.

## Severity

Every surviving finding carries a `SEVERITY: N.N` on its own line (0-10), and the pool is emitted in descending severity order.

The bands come from the run file's `## Map` -> `## Severity calibration`: what a 9-10 or a 4-6 means in this repository for this lens. Only when that section holds no band line do the lens's own `## Severity` bands decide.

## findings.md (final output)

One file per run, at `.temp/viber/code-auditor/<run-id>/findings.md`, built in this shape:

- the title line `# Findings - <run-id> (<lens>, <scope>)`;
- directly under it the header line `<lens> · <scope> · U units mapped · H hunts · K confirmed findings · J units not investigated.`, where `U` counts the map's unit lines, `H` the hunts dispatched in the run, `K` the confirmed findings and `J` the mapped units no hunt took on, counting a `U<n>` hunt that left no report after its retry as none; on the diff scope the angle hunts take on every unit, so `J` is 0 and `- Units not investigated:` reads `none`;
- then at most ten full entries, headed `## 1. <title>` through `## 10. <title>`, in descending severity order;
- then the further-findings list, then the coverage notes.

A full entry opens with its tagged lines, in this order:

```
SEVERITY: N.N
CONFIDENCE: <low | medium | high>
VERDICT: <VERIFIED | PARTIALLY VERIFIED | INCONCLUSIVE>
STATUS: INCONCLUSIVE - <missing oracle | critic returned no verdict>
LOCATION: path/to/file.ext:Lstart-Lend
CLASS: <angle slug>: <specific class>
```

The `STATUS:` line is written only on an entry whose verdict is `INCONCLUSIVE`. Below the tagged lines the entry carries three short paragraphs lifted from the report: root cause, reproduction, fix sketch.

The cap is ten full entries, counted for the run and not for a wave:

- A finding whose severity falls in the 1-3 band never gets a full entry, even when slots are left over.
- An `INCONCLUSIVE` finding does count against the ten, with the severity it was filed at and the lowered confidence.
- When more findings qualify than there are slots, order them by higher `SEVERITY` first, then by verdict (`VERIFIED`, then `PARTIALLY VERIFIED`, then `INCONCLUSIVE`), then by higher `CONFIDENCE` (high, medium, low), then by hunt order: `U<n>` by ascending `n`, then `A-<angle slug>` in the lens's angle order, then `V-<n>` by ascending `n`, and within one hunt by ascending `k`. The first ten get full entries; every other one drops into the further-findings list.

`## Further findings (N)` holds every surviving finding that got no full entry, the ones past the cap and every 1-3 band finding, as one line each:

```
SEVERITY · LOCATION · CLASS · <title> · <report path>
```

`N` is the number of lines in that section.

`## Coverage notes` closes the file:

```
- Units not investigated: <U<n>, U<n>, ... | none>
- Hunts with no finding: <hunt id, hunt id, ... | none>
- Hunts with no report: <hunt id, ... | none>
```

## Variant wave

After a variant wave, rebuild `findings.md` from the first wave's and the variant wave's findings together, every report and verdict of the run, not just the new wave's. The cap, the ordering, the further-findings list and every count are properties of the run, so a late high-severity finding pushes an earlier one down into the list instead of being appended below it.

## What the skill reads

Ranking a pool of reports must not cost one report read per report. Build the ranking from two inputs only:

- each critic's verdict block (`VERDICT`, `COMMAND`, `OBSERVED`, `SEVERITY`), which arrives in that critic's final message and is already in context, no file read at all;
- the first four lines of each report: `# <title>`, `LOCATION`, `CLASS`, `SEVERITY`. Read those four lines, never the whole file. `CONFIDENCE` sits on the fifth line; read it too, but only for the findings a tie-break leaves competing for the last slot.

A full report is opened once and only once: for an entry that made the cap, while that entry is being written, to lift its root cause, reproduction and fix sketch. No other section of any report is opened in any phase: not to deduplicate, not to build the further-findings list, not to rebuild the file after the variant wave.
