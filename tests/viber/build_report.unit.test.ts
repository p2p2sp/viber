/*
 * build_report.unit.test.ts - locks down idea-validator's report builder: every
 * validation rule of report-data.json, the label merge, the one-pass template
 * fill, exit 2 on a wrong argument count, the research prompt texts of
 * `buildPrompts` and import safety. Imports the
 * script, spawns nothing, writes nothing; the file-writing CLI cases live in
 * build_report.test.ts.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is
 * run directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/build_report.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import path from "node:path";

import {
  DEFAULT_LABELS,
  buildPrompts,
  main,
  mergeLabels,
  render,
  validate,
} from "../../viber/skills/idea-validator/scripts/build_report.mjs";
import { capture, validReport as valid } from "./build_report-fixture.ts";

const dim = (d: any, key: string) => d.scorecard.dimensions.find((x: any) => x.key === key);
const TEMPLATE = `<html lang="__LANG__"><title>__TITLE__</title><script type="application/json">__REPORT_DATA__</script></html>`;

// ---------------------------------------------------------------------------
// validate - one case per rule: the mutation and the problem it must report
// ---------------------------------------------------------------------------

test("validate accepts the minimal valid report", () => {
  assert.deepEqual(validate(valid()), []);
});

test("validate rejects a non-object document with a single problem", () => {
  assert.deepEqual(validate([]), ["report data must be a JSON object"]);
});

const RULES: Array<[string, (d: any) => void, string]> = [
  ["a missing required path", (d) => delete d.meta.one_liner, "missing: meta.one_liner"],
  ["a non-boolean quick_mode", (d) => (d.meta.quick_mode = "no"), "wrong type: meta.quick_mode (expected boolean)"],
  ["a string total", (d) => (d.scorecard.total = "3"), "wrong type: scorecard.total (expected number)"],
  ["dimensions that are not a list", (d) => (d.scorecard.dimensions = {}), "wrong type: scorecard.dimensions (expected list)"],
  ["an unknown verdict label", (d) => (d.verdict.label = "Maybe"), "verdict.label must be one of: Go, No-Go, Pivot"],
  ["a Pivot without pivot_suggestion", (d) => (d.verdict.pivot_suggestion = ""), "verdict.pivot_suggestion required when label == Pivot"],
  ["dimensions out of canonical order", (d) => d.scorecard.dimensions.reverse(), "scorecard.dimensions keys must be exactly, in order:"],
  ["a missing dimension", (d) => d.scorecard.dimensions.pop(), "scorecard.dimensions keys must be exactly, in order:"],
  ["a score above 5", (d) => (dim(d, "market").score = 6), "dimension market: score must be int 1-5"],
  ["a fractional score", (d) => (dim(d, "market").score = 2.5), "dimension market: score must be int 1-5"],
  ["a boolean score", (d) => (dim(d, "market").score = true), "dimension market: score must be int 1-5"],
  ["an unknown confidence", (d) => (dim(d, "market").confidence = "certain"), "dimension market: confidence must be high/medium/low"],
  ["an empty justification", (d) => (dim(d, "market").justification = ""), "dimension market: justification missing"],
  ["an empty evidence list", (d) => (dim(d, "market").evidence = []), "dimension market: evidence list empty"],
  ["a weight of 3", (d) => (dim(d, "market").weight = 3), "dimension market: weight must be 1 or 2"],
  ["a total off by more than 0.06", (d) => (d.scorecard.total = 3.1), "scorecard.total 3.1 does not match recomputed 3.00"],
  ["a Go with a key dimension at 2", (d) => {
    d.verdict.label = "Go";
    dim(d, "distribution").score = 2;
    d.scorecard.total = 2.82;
  }, "verdict Go not allowed: key dimension(s) distribution score ≤ 2"],
  ["a Go with a low-confidence key dimension and no condition", (d) => {
    d.verdict.label = "Go";
    dim(d, "autopilot_fit").confidence = "low";
  }, "verdict Go with low-confidence key dimension(s) autopilot_fit must set verdict.conditional_on"],
  ["six council members", (d) => d.council.members.pop(), "council.members must have 7 entries"],
  ["an empty dissent", (d) => (d.council.dissent.text = ""), "council.dissent.text is mandatory"],
  ["a missing round2_held", (d) => delete d.council.round2_held, "council.round2_held missing"],
  ["a skipped round 2 outside quick mode", (d) => (d.council.round2_held = false), "round2_held must be true unless quick_mode"],
  ["a missing lean canvas box", (d) => delete d.lean_canvas.uvp, "lean_canvas.uvp missing"],
  ["a missing research block", (d) => delete d.research.market, "research.market missing"],
  ["a research list that is a string", (d) => (d.research.problem.open = "none"), "research.problem.open must be a list"],
  ["two experiments", (d) => d.experiments.pop(), "experiments must have 3-8 entries"],
  ["nine experiments", (d) => d.experiments.push(...valid().experiments, ...valid().experiments), "experiments must have 3-8 entries"],
  ["an experiment without a metric", (d) => (d.experiments[1].metric = ""), "experiment 2: metric missing"],
  ["a missing threshold", (d) => (d.thresholds.no_go = ""), "thresholds.no_go missing"],
  ["a missing weekly hours total", (d) => delete d.autopilot_fit.hours_per_week_total, "autopilot_fit.hours_per_week_total missing"],
  ["killers that are not a list", (d) => (d.autopilot_fit.killers = null), "autopilot_fit.killers must be a list (may be empty)"],
  ["a missing closing note", (d) => delete d.appendix.closing_note, "appendix.closing_note missing"],
  ["sources that are not a list", (d) => (d.appendix.sources = {}), "appendix.sources must be a list"],
];

for (const [name, mutate, expected] of RULES) {
  test(`validate reports ${name}`, () => {
    const d = valid();
    mutate(d);
    const problems: string[] = validate(d);
    assert.ok(problems.some((p) => p.includes(expected)), `expected "${expected}" in:\n${problems.join("\n")}`);
  });
}

test("validate accepts a skipped round 2 in quick mode", () => {
  const d = valid();
  d.meta.quick_mode = true;
  d.council.round2_held = false;
  assert.deepEqual(validate(d), []);
});

test("validate accepts a Go with a low-confidence key dimension when conditional_on is set", () => {
  const d = valid();
  d.verdict.label = "Go";
  d.verdict.conditional_on = "experiment #1";
  dim(d, "problem").confidence = "low";
  assert.deepEqual(validate(d), []);
});

test("validate still applies the verdict rules when another dimension lacks its score", () => {
  const d = valid();
  d.verdict.label = "Go";
  delete dim(d, "market").score;
  dim(d, "problem").score = 1;
  dim(d, "distribution").confidence = "low";
  const problems: string[] = validate(d);
  assert.ok(problems.includes("dimension market: score must be int 1-5"));
  assert.ok(problems.some((p) => p.startsWith("verdict Go not allowed: key dimension(s) problem")));
  assert.ok(problems.some((p) => p.startsWith("verdict Go with low-confidence key dimension(s) distribution")));
});

test("validate skips the total check while a score or weight is invalid", () => {
  const d = valid();
  dim(d, "market").weight = 3;
  dim(d, "timing").score = 9;
  const problems: string[] = validate(d);
  assert.ok(!problems.some((p) => p.startsWith("scorecard.total")), problems.join("\n"));
});

// ---------------------------------------------------------------------------
// mergeLabels - English defaults under the data's own labels
// ---------------------------------------------------------------------------

test("mergeLabels fills every default and keeps the data's own labels", () => {
  const d = valid();
  d.labels = { verdict: "Werdykt", extra: "E", canvas: { uvp: "UVP" } };
  const { labels } = mergeLabels(d);
  assert.equal(labels.verdict, "Werdykt");
  assert.equal(labels.extra, "E");
  assert.equal(labels.scorecard, DEFAULT_LABELS.scorecard);
  assert.equal(labels.canvas.uvp, "UVP");
  assert.equal(labels.canvas.problem, DEFAULT_LABELS.canvas.problem);
  assert.equal(DEFAULT_LABELS.verdict, "Verdict");
  assert.equal(DEFAULT_LABELS.canvas.uvp, "Unique value proposition");
});

test("mergeLabels supplies every default when the data has no labels", () => {
  const { labels } = mergeLabels(valid());
  assert.deepEqual(labels, DEFAULT_LABELS);
});

// ---------------------------------------------------------------------------
// render - one-pass fill, escaping
// ---------------------------------------------------------------------------

test("render escapes </ in the data and < in the title, and keeps $ patterns literal", () => {
  const d = valid();
  d.meta.title = "A </script> $& $' __LANG__";
  const html: string = render(d, TEMPLATE);
  assert.ok(html.startsWith('<html lang="pl"><title>A &lt;/script> $& $\' __LANG__</title>'), html);
  const payload = html.slice(html.indexOf("json\">") + 6, html.lastIndexOf("</script>"));
  assert.ok(!payload.includes("</"), payload);
  assert.equal(JSON.parse(payload.replaceAll("<\\/", "</")).meta.title, d.meta.title);
});

// ---------------------------------------------------------------------------
// main - CLI exit codes
// ---------------------------------------------------------------------------

test("main returns 2 and prints usage on a wrong argument count", () => {
  const out = capture();
  assert.equal(main(["only-one.json"], out.log), 2);
  assert.match(out.lines.join("\n"), /Usage: node build_report\.mjs/);
});

const PROMPTS_ARGS: Array<[string, string[]]> = [
  ["no stage", ["--prompts"]],
  ["an unknown stage", ["--prompts", "bogus", "w"]],
  ["a missing working directory", ["--prompts", "research"]],
  ["an extra argument", ["--prompts", "research", "w", "extra"]],
];

for (const [what, args] of PROMPTS_ARGS) {
  test(`main with --prompts returns 2 and prints the prompts usage on ${what} (nothing is read or written)`, () => {
    const out = capture();
    assert.equal(main(args, out.log), 2);
    assert.match(out.lines.join("\n"), /Usage: node build_report\.mjs --prompts research <workdir>/);
  });
}

// ---------------------------------------------------------------------------
// buildPrompts - the research prompt files, over small reference texts
// ---------------------------------------------------------------------------

const WD = path.resolve(import.meta.dirname, "wd");
const inWd = (...parts: string[]) => path.join(WD, ...parts);

const PROCESS = [
  "# Process", "", "## Steps 3-5 - Research briefs", "",
  "### Problem research brief -> `03-research-problem.md`", "", "Problem body.", "",
  "### Market research brief -> `04-research-market.md`", "", "Market body.", "",
  "### Competition research brief -> `05-research-competition.md`", "", "Competition body.", "",
  "## Research rules (paste into every research prompt)", "", "- Output skeleton:", "```", "# <Title>", "## Facts", "```", "- URL per fact.", "",
].join("\n");
const DIMENSIONS = [
  "# Dimensions", "", "1. Problem strength (**2**, Target customer): painful?", "", "**Problem strength**", "- 1: none", "- 5: hacked together", "", "**Distribution**", "- 1: nothing", "",
].join("\n");
const REFS = { process: PROCESS, dimensions: DIMENSIONS };
const TAIL = [
  "- Output skeleton:", "```", "# <Title>", "## Facts", "```", "- URL per fact.", "",
  "Read these files:", `- ${inWd("01-normalized.md")}`, `- ${inWd("02-hypotheses.md")}`, "",
].join("\n");
const RULES_HEAD = "## Research rules (paste into every research prompt)\n\n";

const PROMPT_TEXTS: Array<[string, string]> = [
  ["problem", [
    "### Problem research brief -> `03-research-problem.md`", "", "Problem body.", "",
    "**Problem strength**", "- 1: none", "- 5: hacked together", "", RULES_HEAD + TAIL,
    `Write your output to ${inWd("03-research-problem.md")}.`, "",
  ].join("\n")],
  ["market", [
    "### Market research brief -> `04-research-market.md`", "", "Market body.", "", RULES_HEAD + TAIL,
    `Write your output to ${inWd("04-research-market.md")}.`, "",
  ].join("\n")],
  ["competition", [
    "### Competition research brief -> `05-research-competition.md`", "", "Competition body.", "", RULES_HEAD + TAIL,
    `Write your output to ${inWd("05-research-competition.md")}.`, "",
  ].join("\n")],
];

test("buildPrompts for research gives the problem, market and competition prompt files under prompts/ in that order", () => {
  const files = buildPrompts("research", WD, "en", REFS);
  assert.deepEqual(files.map((f: any) => [f.name, f.path]), [
    ["problem", inWd("prompts", "research-problem.md")],
    ["market", inWd("prompts", "research-market.md")],
    ["competition", inWd("prompts", "research-competition.md")],
  ]);
});

for (const [name, text] of PROMPT_TEXTS) {
  test(`buildPrompts for research makes the ${name} prompt its brief ${name === "problem" ? "then the Problem strength anchors, " : ""}the research rules, the two input paths and the output path, fenced lines never ending a section`, () => {
    const found = buildPrompts("research", WD, "en", REFS).find((f: any) => f.name === name);
    assert.equal(found.text, text);
  });
}

const MISSING: Array<[string, any, RegExp]> = [
  ["a market brief", { ...REFS, process: PROCESS.replace("### Market research brief", "### Market notes") }, /### Market research brief/],
  ["the research rules", { ...REFS, process: PROCESS.replace("## Research rules", "## Other") }, /## Research rules/],
  ["the Problem strength block", { ...REFS, dimensions: DIMENSIONS.replace("**Problem strength**", "**Other**") }, /Problem strength/],
];

for (const [what, refs, named] of MISSING) {
  test(`buildPrompts throws naming the section when ${what} is missing`, () => {
    assert.throws(() => buildPrompts("research", WD, "en", refs), named);
  });
}

// ---------------------------------------------------------------------------
// import safety
// ---------------------------------------------------------------------------

test("importing the script does not run its CLI", () => {
  assert.equal(typeof main, "function");
  assert.ok(
    process.exitCode === undefined || process.exitCode === 0,
    `process.exitCode should be unset or 0 after import, got ${String(process.exitCode)}`,
  );
});
