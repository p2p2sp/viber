---
name: idea-validator
description: Validates a business idea as a side-project candidate. Runs web research (problem, market, competition), scores it on 9 dimensions including Distribution, Side-project fit and Autopilot fit, convenes a 7-member council of independent perspectives, and produces a single self-contained HTML report with scorecard, dissent, experiment plan and pre-committed decision thresholds. User-invoked only.
argument-hint: "[idea text | path/to/idea.md] [--quick]"
disable-model-invocation: true
allowed-tools: WebSearch, WebFetch, Read, Write, Glob, Agent, AskUserQuestion, Bash(node ${CLAUDE_SKILL_DIR}/scripts/build_report.mjs:*), Bash(mkdir:*), Bash(ls:*), Bash(date:*)
---

# Idea Validator

Answer one question: **is this idea worth turning into a side project?** Not "is this a good startup". The user builds with an AI coding agent, so the build itself is cheap and non-differentiating; what differentiates is the problem, distribution, and whether the thing runs without the user after launch.

The output is one standalone HTML file. Everything before that is working material.

## Arguments

`$ARGUMENTS`

- Everything except flags is the idea: free text, or a path to a file (`.md`, `.txt`). If it looks like a path, read it.
- `--quick`: skip council round 2 (responses). Use only when the user explicitly passes it; note in the report that round 2 was skipped.
- No idea given: ask for it before doing anything else.
- Before step 0 run `node ${CLAUDE_SKILL_DIR}/scripts/build_report.mjs` with no arguments: exit 2 proves Node.js is present; `node` not found -> stop and tell the user the report needs Node.js (https://nodejs.org).

## Ground rules (apply throughout the whole run)

1. **Evidence or "no data".** Every number in the report has a source URL or is marked `no data found`. Never estimate silently; an estimate is allowed only when labelled as an estimate with its method shown.
2. **Ask, don't guess.** Missing input that changes the answer is asked once at intake with `AskUserQuestion`, with a "don't know" option, then the run proceeds. Never re-ask later.
3. **Facts / conclusions / recommendations stay separated** in every file and every report section.
4. **Disagreement is preserved, not averaged.** Between sources and between council members.
5. **Deterministic structure.** Same steps, same council, same report layout every run, so two ideas can be compared side by side.
6. **Report language = language of the idea description.** The user-facing report is written in whatever language the idea was written in. Council members also write in that language.
7. **Cheap build is a trap.** If the analysis drifts toward "just build it and see", stop: a cheap build changes which experiment is cheapest, it does not remove the need to validate demand and distribution first.

## Working directory

Create `.temp/viber/idea-validator/<slug>-<YYYY-MM-DD>/` (slug = 2-4 words from the idea, kebab-case) for every working file. Subagents read the working files by path, so the main context stays small. The deliverable `report.html` is the one file outside it (step 15).

```
00-input.md            raw idea + answers to clarifying questions
01-normalized.md       Lean Canvas + hidden assumptions
02-hypotheses.md       risk hypotheses, riskiest first
03-research-problem.md
04-research-market.md
05-research-competition.md
06-business-model.md
07-distribution.md
08-side-project-fit.md
09-autopilot-fit.md
10-council-r1/<member>.md
11-council-r2/<member>.md   (absent with --quick)
12-synthesis.md
13-experiments.md      experiment plan + decision thresholds
report-data.json
```

## Process

### Step 0 - Intake
Read `${CLAUDE_SKILL_DIR}/references/process.md` and follow its Step 0. -> `00-input.md`

### Step 1 - Normalize
Lean Canvas and hidden assumptions per `process.md` Step 1. Include every "it will sell itself" style claim as an assumption. -> `01-normalized.md`

### Step 2 - Risk hypotheses
Per `process.md` Step 2, riskiest first. -> `02-hypotheses.md`

### Steps 3-5 - Research (three parallel subagents)
Read `${CLAUDE_SKILL_DIR}/references/dimensions.md` (steps 6-9 and 12 use it too). Run `node ${CLAUDE_SKILL_DIR}/scripts/build_report.mjs --prompts research <working directory>`, then launch one `general-purpose` subagent per `PROMPT: <name> | <path>` line, all in the same turn, each with the prompt `Read <path> and follow it.` Wait for all three.

### Steps 6-9 - Model, Distribution, Side-project fit, Autopilot fit
In the main context, from the research files, per `dimensions.md`. -> files 06-09
- `06-business-model.md`: revenue model, price points against competitors' pricing, unit economics.
- `07-distribution.md`: per channel, whether the user has access today (yes / partial / no), cost per customer, time to first signal, autopilot compatibility; then the first channel to test.
- `08` and `09`: the Side-project fit and Autopilot fit protocols.

### Step 10 - Council round 1 (7 parallel subagents, isolated)
Read `${CLAUDE_SKILL_DIR}/references/council.md`, run `node ${CLAUDE_SKILL_DIR}/scripts/build_report.mjs --prompts council-r1 <working directory> <report language>` and launch one `general-purpose` subagent per `PROMPT:` line, all seven in the same turn, each with `Read <path> and follow it.` -> `10-council-r1/<member>.md`

### Step 11 - Council round 2 (skipped only with `--quick`)
Run `--prompts council-r2 <working directory> <report language>` the same way and dispatch its `PROMPT:` lines, all seven in one turn. Round 2 turns the council from a survey into a debate, so it is on by default. -> `11-council-r2/<member>.md`

### Step 12 - Synthesis and scorecard (main context, moderator role)
Per the `council.md` "Moderator protocol" and the `dimensions.md` "Verdict rules". -> `12-synthesis.md`

### Step 13 - Experiment plan
Read `${CLAUDE_SKILL_DIR}/references/experiments.md` and build the plan from it. -> `13-experiments.md`

### Step 14 - Decision thresholds
Before the user sees any experiment result, write the Go / Pivot / No-Go thresholds per the `experiments.md` "Decision thresholds" section, at the end of `13-experiments.md`. Never skip this step: it is the guard against reading results optimistically.

### Step 15 - Build the report
1. Read `${CLAUDE_SKILL_DIR}/references/report-schema.md` and assemble `report-data.json` in the working directory exactly to it; the renderer depends on the field names.
2. Write `appendix.closing_note` in the report language: the report does not answer "will they pay", only the step-13 experiments can; the verdict means worth testing, not worth building; the final decision combines the experiment results with the user's own time constraints.
3. Create `docs/business/<slug>/` (same slug as the working directory) at the host repo root.
4. Run `node ${CLAUDE_SKILL_DIR}/scripts/build_report.mjs .temp/viber/idea-validator/<slug>-<YYYY-MM-DD>/report-data.json docs/business/<slug>/report.html`. On exit 1 it lists every problem: fix the JSON and rerun, never edit the HTML.
5. Tell the user the path to `report.html` and give a 3-line summary: verdict, biggest risk, first experiment to run. Close with the line that the verdict means worth testing, not worth building.
