#!/usr/bin/env node
// Build the idea-validator HTML report from report-data.json. No dependencies.
//
// Usage: node build_report.mjs <report-data.json> <output.html>
//
// Validates the required structure (see references/report-schema.md), fills in
// English defaults for any missing UI label, injects the JSON into
// templates/report-template.html and writes a single self-contained HTML file.
// Exits 1 and lists every problem when required fields are missing, so the
// agent fixes the JSON rather than the HTML. Exits 2 on a wrong argument count.

import fs from "node:fs";
import { fileURLToPath } from "node:url";

const DOC = `Build the idea-validator HTML report from report-data.json.

Usage: node build_report.mjs <report-data.json> <output.html>

Validates the required structure (see references/report-schema.md), fills in
English defaults for any missing UI label, injects the JSON into
templates/report-template.html and writes a single self-contained HTML file.
Exits 1 and lists every problem when required fields are missing, so the
agent fixes the JSON rather than the HTML. Exits 2 on a wrong argument count.`;

export const TEMPLATE = fileURLToPath(new URL("../templates/report-template.html", import.meta.url));

export const DIMENSION_KEYS = ["problem", "market", "competition", "advantage", "revenue",
  "distribution", "timing", "side_project_fit", "autopilot_fit"];
export const KEY_DIMENSIONS = new Set(["problem", "distribution", "autopilot_fit"]);
const VERDICTS = ["Go", "No-Go", "Pivot"];
const CONF = ["high", "medium", "low"];

export const DEFAULT_LABELS = {
  verdict: "Verdict", scorecard: "Scorecard", weighted_total: "Weighted total",
  confidence: "Confidence", dimension: "Dimension", score: "Score", weight: "Weight",
  owner: "Owner", dissenters: "Dissenters", evidence: "Evidence", council: "Council",
  council_health: "Council health", agreed: "Agreed points", disputed: "Disputed points",
  dissent: "Dissenting opinion", members: "Member opinions", round1: "Round 1",
  round2: "Round 2", round2_skipped: "Round 2 skipped (--quick)",
  arguments: "Strongest arguments", change_my_mind: "What would change my mind",
  lean_canvas: "Lean Canvas", assumptions: "Hidden assumptions", research: "Research",
  problem: "Problem & customer", market: "Market", competition: "Competition",
  business_model: "Business model", distribution: "Distribution", facts: "Facts",
  conclusions: "Conclusions", open: "No data / open questions", quotes: "Voices of users",
  sizing: "Market sizing", method: "Method", regulation: "Regulation",
  competitors: "Competitors", graveyard: "Graveyard", whitespace: "Whitespace",
  channels: "Channels", side_project_fit: "Side-project fit", autopilot_fit: "Autopilot fit",
  hours_per_week: "hours/week after launch", killers: "Autopilot killers", fix: "Proposed fix",
  risks: "Risks", likelihood: "Likelihood", impact: "Impact", warning_sign: "Early warning",
  mitigation: "Mitigation", experiments: "Experiment plan", hypothesis: "Hypothesis",
  test: "Test", metric: "Metric", pass: "Pass threshold", fail: "Fail threshold",
  cost: "Cost", duration: "Duration", thresholds: "Decision thresholds (set in advance)",
  appendix: "Appendix", data_gaps: "Data gaps", methodology: "Methodology",
  sources: "Sources", outdated: "possibly outdated", closing_note: "What this report does not say",
  biggest_risk: "Biggest risk", conditional_on: "Conditional on", pivot_suggestion: "What to change",
  expand_all: "Expand all", collapse_all: "Collapse all", generated: "Generated",
  quick_mode_note: "Quick mode: council without round 2",
  canvas: {
    problem: "Problem", solution: "Solution", uvp: "Unique value proposition",
    unfair_advantage: "Unfair advantage", customer_segments: "Customer segments",
    key_metrics: "Key metrics", channels: "Channels", costs: "Cost structure",
    revenue: "Revenue streams",
  },
};

const isObj = (x) => typeof x === "object" && x !== null && !Array.isArray(x);
const obj = (x) => (isObj(x) ? x : {});
const has = (o, k) => isObj(o) && Object.prototype.hasOwnProperty.call(o, k);

// "Present and non-empty": null, false, 0, "", [] and {} all count as empty.
function filled(x) {
  if (Array.isArray(x)) return x.length > 0;
  if (isObj(x)) return Object.keys(x).length > 0;
  return Boolean(x);
}

const validScore = (x) => Number.isInteger(x.score) && x.score >= 1 && x.score <= 5;
const validWeight = (x) => x.weight === 1 || x.weight === 2;
const list = (xs) => xs.join(", ");

/** Returns every problem found in the parsed report data; an empty list means valid. */
export function validate(d) {
  const p = [];
  const check = (cond, msg) => { if (!cond) p.push(msg); };
  if (!isObj(d)) return ["report data must be a JSON object"];

  const req = (path, typ) => {
    let cur = d;
    for (const part of path.split(".")) {
      if (!has(cur, part)) {
        p.push(`missing: ${path}`);
        return undefined;
      }
      cur = cur[part];
    }
    if (typ && !typ.test(cur)) {
      p.push(`wrong type: ${path} (expected ${typ.name})`);
      return undefined;
    }
    return cur;
  };

  for (const path of ["meta.title", "meta.date", "meta.language", "meta.one_liner",
    "verdict.label", "verdict.summary", "verdict.biggest_risk",
    "council.dissent", "council.members", "lean_canvas", "research",
    "side_project_fit", "autopilot_fit", "experiments", "thresholds", "appendix"]) {
    req(path);
  }
  req("meta.quick_mode", { name: "boolean", test: (x) => typeof x === "boolean" });
  req("scorecard.total", { name: "number", test: (x) => typeof x === "number" });
  const dims = req("scorecard.dimensions", { name: "list", test: Array.isArray });

  const v = obj(d.verdict);
  check(VERDICTS.includes(v.label), `verdict.label must be one of: ${list(VERDICTS)}`);
  if (v.label === "Pivot") {
    check(filled(v.pivot_suggestion), "verdict.pivot_suggestion required when label == Pivot");
  }

  if (Array.isArray(dims)) {
    const ds = dims.map(obj);
    const keys = ds.map((x) => x.key);
    check(keys.length === DIMENSION_KEYS.length && keys.every((k, i) => k === DIMENSION_KEYS[i]),
      `scorecard.dimensions keys must be exactly, in order: ${list(DIMENSION_KEYS)}`);
    for (const x of ds) {
      const k = x.key;
      check(validScore(x), `dimension ${k}: score must be int 1-5`);
      check(CONF.includes(x.confidence), `dimension ${k}: confidence must be high/medium/low`);
      check(filled(x.justification), `dimension ${k}: justification missing`);
      check(Array.isArray(x.evidence) && x.evidence.length > 0, `dimension ${k}: evidence list empty (use 'no data found')`);
      check(validWeight(x), `dimension ${k}: weight must be 1 or 2`);
    }
    // The recomputed total is meaningful only when every score and weight is valid;
    // otherwise the per-dimension problems above already fail the run.
    const total = obj(d.scorecard).total;
    if (typeof total === "number" && ds.length > 0 && ds.every((x) => validScore(x) && validWeight(x))) {
      const tot = ds.reduce((s, x) => s + x.score * x.weight, 0) / ds.reduce((s, x) => s + x.weight, 0);
      if (Math.abs(tot - total) > 0.06) {
        p.push(`scorecard.total ${total} does not match recomputed ${tot.toFixed(2)}`);
      }
    }
    // Verdict rules run on every dimension that carries a usable value.
    if (v.label === "Go") {
      const weakKey = ds.filter((x) => KEY_DIMENSIONS.has(x.key) && validScore(x) && x.score <= 2).map((x) => x.key);
      if (weakKey.length) {
        p.push(`verdict Go not allowed: key dimension(s) ${list(weakKey)} score ≤ 2 (see dimensions.md verdict rules)`);
      }
      const lowKey = ds.filter((x) => KEY_DIMENSIONS.has(x.key) && x.confidence === "low").map((x) => x.key);
      if (lowKey.length && !filled(v.conditional_on)) {
        p.push(`verdict Go with low-confidence key dimension(s) ${list(lowKey)} must set verdict.conditional_on`);
      }
    }
  }

  const c = obj(d.council);
  check(Array.isArray(c.members) && c.members.length === 7, "council.members must have 7 entries");
  check(isObj(c.dissent) && filled(c.dissent.text), "council.dissent.text is mandatory");
  check(has(c, "round2_held"), "council.round2_held missing");
  if (obj(d.meta).quick_mode === false) {
    check(c.round2_held === true, "round2_held must be true unless quick_mode");
  }

  const lc = obj(d.lean_canvas);
  for (const k of ["problem", "customer_segments", "uvp", "solution", "channels", "revenue", "costs", "key_metrics", "unfair_advantage"]) {
    check(has(lc, k), `lean_canvas.${k} missing`);
  }

  const r = obj(d.research);
  for (const k of ["problem", "market", "competition", "business_model", "distribution"]) {
    const blk = r[k];
    check(isObj(blk), `research.${k} missing`);
    if (isObj(blk)) {
      for (const sub of ["facts", "conclusions", "open"]) {
        check(Array.isArray(blk[sub]), `research.${k}.${sub} must be a list`);
      }
    }
  }

  const ex = d.experiments;
  check(Array.isArray(ex) && ex.length >= 3 && ex.length <= 8, "experiments must have 3-8 entries");
  if (Array.isArray(ex)) {
    ex.forEach((raw, i) => {
      const e = obj(raw);
      for (const k of ["hypothesis", "test", "metric", "pass", "fail"]) {
        check(filled(e[k]), `experiment ${e.n ?? i + 1}: ${k} missing`);
      }
    });
  }

  const t = obj(d.thresholds);
  for (const k of ["go", "pivot", "no_go"]) {
    check(filled(t[k]), `thresholds.${k} missing (must be set before experiments run)`);
  }

  const ap = obj(d.autopilot_fit);
  check(filled(ap.hours_per_week_total), "autopilot_fit.hours_per_week_total missing");
  check(Array.isArray(ap.killers), "autopilot_fit.killers must be a list (may be empty)");

  const ad = obj(d.appendix);
  check(filled(ad.closing_note), "appendix.closing_note missing");
  check(Array.isArray(ad.sources), "appendix.sources must be a list");
  return p;
}

/** Puts the English DEFAULT_LABELS under the data's own `labels`, one level deep for `canvas`. */
export function mergeLabels(d) {
  const user = obj(d.labels);
  const { canvas: _canvas, ...userFlat } = user;
  d.labels = {
    ...DEFAULT_LABELS,
    ...userFlat,
    canvas: { ...DEFAULT_LABELS.canvas, ...obj(user.canvas) },
  };
  return d;
}

/** Fills the template in one pass, so text inserted for one placeholder is never re-scanned. */
export function render(d, template) {
  const values = {
    __REPORT_DATA__: JSON.stringify(d).replaceAll("<", "\\u003c"),
    __LANG__: String(d.meta.language),
    __TITLE__: String(d.meta.title).replaceAll("<", "&lt;"),
  };
  return template.replace(/__REPORT_DATA__|__LANG__|__TITLE__/g, (m) => values[m]);
}

/** Runs the CLI on `argv` (without node and the script path) and returns the exit code. */
export function main(argv, log = console.log) {
  if (argv.length !== 2) {
    log(DOC);
    return 2;
  }
  const [src, out] = argv;
  let data;
  try {
    data = JSON.parse(fs.readFileSync(src, "utf-8"));
  } catch (e) {
    log(`Cannot parse ${src}: ${e.message}`);
    return 1;
  }
  const problems = validate(data);
  if (problems.length) {
    log(`${problems.length} problem(s) in ${src}:`);
    for (const x of problems) log(`  - ${x}`);
    return 1;
  }
  const html = render(mergeLabels(data), fs.readFileSync(TEMPLATE, "utf-8"));
  try {
    fs.writeFileSync(out, html, "utf-8");
  } catch (e) {
    log(`Cannot write ${out}: ${e.message}`);
    return 1;
  }
  log(`OK → ${out} (${Math.floor(Buffer.byteLength(html, "utf-8") / 1024)} KB)`);
  return 0;
}

function isEntry() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntry()) {
  process.exitCode = main(process.argv.slice(2));
}
