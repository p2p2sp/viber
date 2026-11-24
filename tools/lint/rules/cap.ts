/*
 * cap.ts - the `cap` rule type: a read set (whole files and named "## " sections) must stay
 * within a word or byte cap.
 */

import type { Finding, RuleType, Tree } from "../engine.ts";

export interface CapParams {
  files: Array<{ path: string; sections?: string[] }>;
  unit: "words" | "bytes";
  max: number;
}

function section(text: string, name: string): string | null {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.trimEnd() === `## ${name}`);
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  if (end < 0) end = lines.length;
  return lines.slice(start, end).join("\n");
}

function size(text: string, unit: CapParams["unit"]): number {
  return unit === "words" ? text.split(/\s+/).filter((w) => w !== "").length : Buffer.byteLength(text, "utf8");
}

function check(tree: Tree, params: CapParams): Finding[] {
  const findings: Finding[] = [];
  let total = 0;
  for (const file of params.files) {
    const text = tree.read(file.path);
    if (text === null) {
      findings.push({ path: file.path, line: 0, message: "file not found" });
      continue;
    }
    for (const name of file.sections ?? [null]) {
      const part = name === null ? text : section(text, name);
      if (part === null) findings.push({ path: file.path, line: 0, message: `section "${name}" not found` });
      else total += size(part, params.unit);
    }
  }
  if (total > params.max) {
    const paths = params.files.map((f) => f.path).join(", ");
    findings.push({ path: paths, line: 0, message: `${total} ${params.unit}, cap ${params.max}` });
  }
  return findings;
}

const cap: RuleType<CapParams> = {
  name: "cap",
  check,
  selfCheck: {
    tree: {
      files: [{ path: "a.md", mode: "100644" }],
      read: () => "one two three",
      list: () => [],
    },
    params: { files: [{ path: "a.md" }], unit: "words", max: 2 },
  },
};

export default cap;
