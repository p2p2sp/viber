# Experiment plan and decision thresholds

## Where hypotheses come from

1. Top entries of `02-hypotheses.md` (riskiest first).
2. Every "what would change my mind" statement from the council, round 1 and 2. These are already phrased as tests; keep the member's name attached.
3. Every autopilot killer without a confirmed fix.
4. Every `no data found` on a key dimension.

The plan holds 3 to 8 experiments. More than 8 is a research programme, not a side project.

## Experiment table (report format)

`# | hypothesis | test | metric | pass threshold | fail threshold | cost (hours / money) | duration | owner-member | order`

Order by: kills the most load-bearing hypothesis first, then cheapest. The first experiment must target the weakest key dimension (Problem strength, Distribution, Autopilot fit).

## Catalogue

Pick the cheapest test that can KILL the hypothesis, not the one that can confirm it.

Format: test (best for): what it can and cannot tell you.

- **Mom Test interviews, 5-10** (Problem strength, segment): past behaviour and current workaround. Cannot tell you they'll pay. Questions must be about the past ("last time this happened, what did you do?"), never about the hypothetical product.
- **Landing page + waitlist** (Distribution, message): whether the pitch converts visitors from a specific channel. Meaningless without a traffic source you can name. Measure visitor-to-signup by source.
- **Fake door / pricing page** (Revenue model, price point): click on "Buy" at a stated price. Tells you intent at that price, not payment. Be transparent after the click.
- **Pre-sale / deposit** (Revenue model): strongest demand signal short of a product. Refundable. Count paid, not promised.
- **Concierge MVP** (Problem strength, delivery model): deliver the outcome manually for 3-5 customers. Tells you what the product must do and what they pay for. Expensive in hours; do it before automating the wrong thing.
- **Agent-built thin MVP** (Activation, retention): since the build is cheap, this is legitimate after demand and channel are tested, never as the first test. Measure return usage in week 2, not signups.
- **Channel probe** (Distribution): post/list/advertise in the one channel the Growth member named. Measure clicks and cost. Two weeks maximum.
- **Sean Ellis PMF survey** (Retention, post-MVP only): "How would you feel if you could no longer use this?" 40% "very disappointed" is the common benchmark, with known false positives; use only with real users.
- **Support-load simulation** (Autopilot fit): run the concierge or MVP phase and log every human intervention with time spent. Extrapolate to hours/week.
- **Dependency stress test** (Risk): read the ToS and pricing history of each critical API; write down what happens if it goes away. Zero cost.

## Decision thresholds (step 14)

Written **before** any experiment runs, at the end of `13-experiments.md`, as three rows (they fill the report's `thresholds`):

- **Go if:** <metric> <comparator> <number> (n = <sample>) for each targeted hypothesis, joined by AND.
- **Pivot if:** the problem is confirmed but the channel or price fails; say what to change.
- **No-Go if:** <metric> <comparator> <number> (n = <sample>) for any targeted hypothesis, joined by OR.

Thresholds must be numbers the user cannot reinterpret later. "Good response" is not a threshold. Include the sample size next to each number.
