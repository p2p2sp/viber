/*
 * tiers.ts - the `tiers` rule type: keeps the legacy test tiers in shape. A legacy logic file
 * (a plain `*.test.ts`) needs a `*.critical.test.ts` sibling unless an exemption names it, a
 * critical file must register a case, and the critical tier stays within a budget of `test(`
 * call sites. Unit and integration files are layers of their own: no sibling, no budget.
 */

import type { Finding, RuleType, Tree } from "../engine.ts";

export interface TiersParams {
  root: string;
  exempt: string[];
  budget: number;
}

type Tier = "unit" | "integration" | "critical" | "logic";

function tierOf(file: string): Tier | null {
  if (file.endsWith(".unit.test.ts")) return "unit";
  if (file.endsWith(".integration.test.ts")) return "integration";
  if (file.endsWith(".critical.test.ts")) return "critical";
  if (file.endsWith(".test.ts")) return "logic";
  return null;
}

/** A `test(` call opening a line, at any indentation, so a loop counts once. */
function caseSites(source: string): number {
  return (source.match(/^[ \t]*test\(/gm) ?? []).length;
}

function check(tree: Tree, params: TiersParams): Finding[] {
  const findings: Finding[] = [];
  const prefix = params.root === "" ? "" : `${params.root.replace(/\/$/, "")}/`;
  const files = tree.files.map((f) => f.path).filter((p) => p.startsWith(prefix) && tierOf(p) !== null).sort();
  const present = new Set(files);
  const siblingOf = (file: string): string => file.replace(/\.test\.ts$/, ".critical.test.ts");

  for (const file of files) {
    if (tierOf(file) === "logic" && !params.exempt.includes(file) && !present.has(siblingOf(file))) {
      findings.push({ path: file, line: 0, message: "logic file has no critical sibling" });
    }
  }
  for (const file of params.exempt) {
    if (!present.has(file) || tierOf(file) !== "logic" || present.has(siblingOf(file))) {
      findings.push({ path: file, line: 0, message: "stale exemption: not a logic file without a critical sibling" });
    }
  }

  let total = 0;
  for (const file of files.filter((f) => tierOf(f) === "critical")) {
    const source = tree.read(file) ?? "";
    const sites = caseSites(source);
    total += sites;
    if (sites === 0 && !/\breaderContract\(/.test(source)) {
      findings.push({ path: file, line: 0, message: "critical file registers no case" });
    }
  }
  if (total > params.budget) {
    findings.push({ path: params.root, line: 0, message: `${total} case sites in the critical tier, budget ${params.budget}` });
  }
  return findings;
}

const tiers: RuleType<TiersParams> = {
  name: "tiers",
  check,
  selfCheck: {
    tree: {
      files: [{ path: "tests/a.test.ts", mode: "100644" }],
      read: () => "",
      list: () => [],
    },
    params: { root: "tests", exempt: [], budget: 0 },
  },
};

export default tiers;
