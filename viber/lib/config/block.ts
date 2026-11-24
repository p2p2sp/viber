/*
 * block.ts - resolves the switch, title, directory and tier lines of the config
 * block, in the fixed order the skills preload, from the text of
 * .claude/viber.yml (null: no file).
 */

import { resolveExtensions } from "./extensions.ts";
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

/** A quoted value is what sits between the quotes; an unquoted one stops at the first blank followed by `#`. */
function title(raw: string | undefined, fallback: string): string {
  let v = raw ?? "";
  const q = v.charAt(0);
  const end = q === '"' || q === "'" ? v.indexOf(q, 1) : -1;
  if (end > 0) v = v.slice(1, end);
  else {
    if (v.startsWith("#")) v = "";
    v = v.replace(/\s#.*$/s, "").replace(/\s+$/, "");
  }
  return v === "" ? fallback : v;
}

function directory(raw: string | undefined, fallback: string): string {
  const v = (raw ?? "").replace(/[\s#].*$/s, "");
  return /^[A-Za-z0-9._-]+$/.test(v) && v !== "." && v !== ".." ? v : fallback;
}

const TIERS = ["haiku", "sonnet", "opus", "fable"];

function tier(raw: string | undefined): string | null {
  const v = word(raw);
  return TIERS.includes(v) ? v : null;
}

export function resolveBlock(text: string | null, hasAgent: (name: string) => boolean = () => false): string[] {
  const extensions = resolveExtensions(text, hasAgent);
  const children = readChildren(text ?? "");
  let min = tier(children.get("tiers.min")) ?? "haiku";
  let max = tier(children.get("tiers.max")) ?? "opus";
  if (TIERS.indexOf(min) > TIERS.indexOf(max)) {
    min = "haiku";
    max = "opus";
  }
  return [
    "# viber config (resolved)",
    ...SWITCHES_BEFORE_TITLES.map((id) => switchLine(id, children.get(id))),
    `github.issue-title: ${title(children.get("github.issue-title"), "{summary}")}`,
    `github.pr-title: ${title(children.get("github.pr-title"), "[{issue-number}] {summary}")}`,
    `build.extensions: ${extensions.steps}`,
    `build.extensions-missing: ${extensions.missing}`,
    `directories.runs: ${directory(children.get("directories.runs"), "_specs")}`,
    `directories.specifications: ${directory(children.get("directories.specifications"), "specs")}`,
    `tiers.min: ${min}`,
    `tiers.max: ${max}`,
    "branching.mode: off",
  ];
}
