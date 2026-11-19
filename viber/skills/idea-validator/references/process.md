# Process reference

Sections map to the step numbers in SKILL.md.

## Contents

- Step 0 - Intake questions
- Step 1 - Normalize (Lean Canvas)
- Step 2 - Risk hypotheses
- Steps 3-5 - Research briefs
- Research rules

## Step 0 - Intake questions

Ask only for the fields below that are missing from the idea text and would change the analysis, each question with a "don't know" option. `AskUserQuestion` takes at most 4 questions per call: ask the first 4 missing fields in the order listed (priority order) in one call and apply the default to every other missing field.

Format: field (why it matters): default if unknown.

- Weekly hours available (Side-project fit thresholds): always ask, never default.
- Existing channels / audience (Distribution score): "None" (from zero).
- Target segment, who exactly (drives problem research and pricing): infer from the idea, mark as assumption.
- Revenue model (Autopilot fit, unit economics): mark as open hypothesis.
- Geography (regulation, competition set, payments): "Global, English-first", mark as assumption.
- Stage (which experiments are already done): Idea.
- Budget for experiments (experiment plan): "Near zero, time only".

Write the raw idea and the answers verbatim to `00-input.md`, "unknown" answers included, then the defaults applied and the report language detected from the idea text.

## Step 1 - Normalize (Lean Canvas)

Nine boxes, one paragraph or bullet list each:

1. Problem (top 3) + existing alternatives
2. Customer segments + early adopters
3. Unique value proposition + high-level concept ("X for Y")
4. Solution (top 3 features)
5. Channels
6. Revenue streams
7. Cost structure (after launch, not build cost)
8. Key metrics
9. Unfair advantage (something that cannot be bought or copied)

Then **hidden assumptions**: number them `A1..An`. Look specifically for:
- "people already do X manually" (is that true? how many?)
- "they will find it via Y"
- "they will pay Z"
- "this API/platform will keep allowing it"
- "support will be minimal"
- any sentence with "just", "simply", "obviously", "everyone"

## Step 2 - Risk hypotheses

Table with columns: `id | assumption | category (desirability/feasibility/viability) | evidence that would confirm | evidence that would kill | current evidence (none/weak/moderate/strong) | risk rank`.

Sort by: category desirability first among ties, then lowest current evidence, then highest impact if false. The top 3 become the primary targets for research and for the experiment plan.

## Steps 3-5 - Research briefs

Each brief is one subagent's prompt file, written by `build_report.mjs --prompts research` together with the Research rules section below.

### Problem research brief -> `03-research-problem.md`

Goal: establish whether the problem exists outside the founder's head, how people cope today, and what coping costs them.

Look for:
- Forum threads, Reddit posts, Stack Exchange, niche communities where people describe the problem in their own words. Quote 3-6 short verbatim complaints (under 15 words each) with links.
- Reviews of existing tools (app stores, G2, Capterra, Chrome Web Store, Product Hunt comments): extract recurring complaints and recurring praise.
- Current workarounds: spreadsheets, manual process, hiring someone, combining two tools, doing nothing.
- Cost of the workaround: time, money, error rate. Only with sources.
- Search demand signals if a free tool exposes them (e.g. Google Trends direction, autocomplete phrases). Report direction, not invented volumes.

Return also: a **problem strength estimate** (1-5, using the Problem strength anchors that follow this brief in your prompt) with the two strongest pieces of evidence for and against.

### Market research brief -> `04-research-market.md`

Goal: size and direction of the market, with the method shown.

- TAM / SAM / SOM with method named per number: top-down (report figure x share) or bottom-up (number of potential customers x price x frequency). Show the arithmetic. If a report figure is behind a paywall and only a press-release number is available, say so.
- At least two independent sources for the headline figure; if they disagree, show both.
- Trend: growing / flat / shrinking, with evidence.
- Regulation that touches the idea (GDPR/data, payments, invoicing, licensing, platform ToS). Name the rule and what it requires; do not interpret legal consequences beyond what a source states.
- Timing: what changed recently that makes this possible or urgent now (new API, price drop, platform change, behaviour shift). If nothing, say so.

### Competition research brief -> `05-research-competition.md`

Goal: map the alternatives, including "do nothing", and find the graveyard.

Four categories: direct competitors, indirect (different solution, same problem), substitutes (spreadsheet, freelancer, manual), and doing nothing.

For each direct/indirect competitor (aim for 5-10, fewer is fine if the space is empty; say so):
`name | URL | what it does | pricing (from pricing page) | target segment | weaknesses from reviews (with links) | strengths | last visible activity (changelog/blog/app-store update date)`

Then:
- **Graveyard**: products that attempted this and shut down or went dormant. Search "<category> shut down", "<category> sunset", Product Hunt launches from 2-5 years ago with dead links. For each: what it did, when it stopped, any stated reason.
- **Whitespace**: what nobody serves, based on the weaknesses column, labelled as a conclusion, not a fact.
- **Threat from incumbents**: could a large player add this as a feature? Any evidence they are moving that way?

## Research rules

- Output skeleton:
  ```
  # <Title>
  ## Facts
  - fact - source: URL (date; flag "possibly outdated" if >2y)
  ## Conclusions
  ## Open questions / no data found
  ```
- URL per fact. No URL: it goes under Conclusions or Open questions, never under Facts.
- Two independent sources (not citing each other) for every key number; report both when they disagree.
- Older than ~2 years: flag `possibly outdated`.
- Aggregator/SEO blog posts are last resort; prefer pricing pages, official docs, reports, app-store pages, reviews.
- `no data found` is a legitimate output. Never fill a gap with a plausible-sounding figure.
- Never reproduce long passages from sources; short quotes (under 15 words) with attribution, or paraphrase.
