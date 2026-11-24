/*
 * block.ts - resolves the switch lines of the config block, in the fixed order
 * the skills preload, from the text of .claude/viber.yml (null: no file).
 */

import { readChildren } from "./lines.ts";

const SWITCHES_BEFORE_TITLES = [
  "planning.adr",
  "planning.outside-plan-review",
  "build.baseline-tests",
  "build.final-review",
  "build.memory",
  "build.rules",
  "build.qa",
  "build.cleanup",
  "build.red-check",
  "github.issues",
];

/** The value cut at its first blank or `#`, in lower case. */
function word(raw: string | undefined): string {
  return (raw ?? "").replace(/[\s#].*$/s, "").toLowerCase();
}

function switchLine(id: string, raw: string | undefined): string {
  const v = word(raw);
  if (id === "build.baseline-tests") return `${id}: ${v === "full" || v === "true" ? "full" : v === "fast" ? "fast" : "off"}`;
  return `${id}: ${v === "true"}`;
}

export function resolveBlock(text: string | null): string[] {
  const children = readChildren(text ?? "");
  return [
    "# viber config (resolved)",
    ...SWITCHES_BEFORE_TITLES.map((id) => switchLine(id, children.get(id))),
    "github.issue-title: {summary}",
    "github.pr-title: [{issue-number}] {summary}",
    "build.extensions: none",
    "build.extensions-missing: none",
    "directories.runs: _specs",
    "directories.specifications: specs",
    "tiers.min: haiku",
    "tiers.max: opus",
    "branching.mode: off",
  ];
}
