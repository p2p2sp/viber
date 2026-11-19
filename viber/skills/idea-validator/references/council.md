# Council protocol

Seven members, each with a different guiding question and different primary dimensions. Isolation in round 1 is not optional: the point is independent perspectives.

## Members

Format: number, member, file under `references/council/`: guiding question. Scores.

1. Target customer, `01-customer.md`: Do I really have this problem, and would I pay for this? Scores Problem strength, Revenue model.
2. Skeptic / red team, `02-skeptic.md`: What must be true for this to work, and why is it probably not? Scores all, from the contrarian side.
3. Market analyst / investor, `03-analyst.md`: Market, competition, timing, unit economics. Scores Market size, Competition, Timing.
4. Growth / distribution, `04-growth.md`: How will the first 100 customers hear about this? Scores Distribution.
5. Operator, `05-operator.md`: What hurts in month 3 after launch? Scores Side-project fit, Autopilot fit.
6. Risk & legal, `06-risk.md`: Regulation, API dependencies, what kills this with one external decision? Scores Autopilot fit; writes the risk register.
7. Optimist / visionary, `07-visionary.md`: Best realistic case; where does this lead if it works? Scores Advantage / defensibility; writes the upside.

## Launching the members

`build_report.mjs --prompts council-r1` and `council-r2` write one prompt file per member; each member is its own `general-purpose` subagent, all seven in the same turn.

Never summarise the research for the member, tell it what other members think, or tell it what verdict you expect.

## Round-1 output format (every member, verbatim headings)

```
# <Member name> - round 1
## Position
One of: Go / Pivot / No-Go, plus one sentence.
## Three strongest arguments
1. ... (cite file + URL)
2. ...
3. ...
## Scores
Table: dimension | score 1-5 | confidence | one-line reason - only for your primary dimensions, plus any other dimension you feel strongly about.
## What would change my mind
2-4 concrete, testable statements ("if 5 of 10 interviewees say X, I move to Go").
## Facts I relied on / facts I could not verify
## <Each extra section your member file asks for, under the name it gives>
```

## Round 2 (default on; skipped only with `--quick`)

The same seven members again, all in the same turn, each answering in this format by responding to specific arguments by name ("The Skeptic's argument 2 is wrong because..." / "The Operator convinced me on...").

```
# <Member name> - round 2
## Responses to other members
- To <member>, argument <n>: agree / disagree, why, evidence.
## Updated position
Same as before / changed to ... because ...
## Updated scores (only if changed)
## Unresolved disagreement I want recorded
```

## Moderator protocol (main context, step 12)

The moderator has no opinion of its own and adds no argument of its own. It reads all round-1 and round-2 files and produces `12-synthesis.md`:

1. **Agreed points**: claims at least five members support, each with the members named.
2. **Disputed points**: each with the members on each side, their strongest argument, and whether round 2 moved anyone. Disputes are preserved; the moderator never resolves them.
3. **Scorecard**: per dimension, the primary owner's score, range if disputed, confidence per `dimensions.md`, one-paragraph justification quoting members, evidence links, dissenters named.
4. **Verdict**: Go / Pivot / No-Go per the `dimensions.md` verdict rules, with the arithmetic shown and the weakest-key-dimension rule applied explicitly.
5. **Biggest single risk**: one, named by the council, not chosen by the moderator.
6. **Risk register**: the Risk & legal member's round-1 register with any change from its round-2 file; it fills the report's `risks`.
7. **Dissenting opinion**: mandatory. Written from the losing side's best arguments, in their words, at least as long as the verdict justification. The losing side: for No-Go, the Visionary and the Customer; for Go, the Skeptic and Risk & legal; for Pivot, the larger group of members whose final position is Go or No-Go (on a tie or when nobody holds either, the Skeptic and Risk & legal).
8. **Council health**: did positions differ in round 1? Did anyone move in round 2? Unanimity without reservation from all seven members fills `verdict.council_warning`: the council likely failed to produce independent views, so the agreement is not strong evidence; with `--quick`, the warning recommends a re-run without it.

The moderator attributes every sentence to a member. A point that cannot be attributed stays out of the synthesis.

## Safeguards against fake diversity

- Separate subagent per member; never one subagent playing all seven.
- Members see the same research, so disagreement is about interpretation and priorities, not about facts.
- The moderator adds nothing; a thin synthesis is a finding about the council, not a gap to fill.
