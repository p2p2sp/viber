/*
 * build_report-fixture.ts - what the build_report test files share: the path of the script
 * the spawning tiers run, and the minimal report-data.json every one of them starts from, which
 * passes every check of build_report.mjs (weighted total 3.0, a Pivot with its suggestion,
 * round 2 held, three experiments).
 */

import path from "node:path";

import { DIMENSION_KEYS } from "../../viber/skills/idea-validator/scripts/build_report.mjs";

export const SUT = path.resolve(import.meta.dirname, "../../viber/skills/idea-validator/scripts/build_report.mjs");

export function validReport(): any {
  return {
    meta: { title: "Idea", date: "2026-10-07", language: "pl", quick_mode: false, one_liner: "x" },
    verdict: { label: "Pivot", conditional_on: "", summary: "s", biggest_risk: "r", pivot_suggestion: "p" },
    scorecard: {
      total: 3.0,
      dimensions: DIMENSION_KEYS.map((key: string) => ({
        key,
        score: 3,
        weight: key === "problem" || key === "distribution" ? 2 : 1,
        confidence: "medium",
        justification: "j",
        evidence: [{ text: "no data found", url: "" }],
      })),
    },
    council: { round2_held: true, dissent: { from: ["Skeptic"], text: "d" }, members: Array.from({ length: 7 }, (_, i) => ({ name: `m${i}` })) },
    lean_canvas: { problem: "", customer_segments: "", uvp: "", solution: "", channels: "", revenue: "", costs: "", key_metrics: "", unfair_advantage: "" },
    research: Object.fromEntries(["problem", "market", "competition", "business_model", "distribution"].map((k) => [k, { facts: [], conclusions: [], open: [] }])),
    side_project_fit: { score: 3 },
    autopilot_fit: { score: 3, hours_per_week_total: "2-4", killers: [] },
    experiments: [1, 2, 3].map((n) => ({ n, hypothesis: "h", test: "t", metric: "m", pass: "p", fail: "f" })),
    thresholds: { go: "g", pivot: "p", no_go: "n" },
    appendix: { closing_note: "c", sources: [] },
  };
}

/** A `log` for `main` that keeps every printed line. */
export function capture(): { log: (line: string) => void; lines: string[] } {
  const lines: string[] = [];
  return { log: (line) => lines.push(line), lines };
}
