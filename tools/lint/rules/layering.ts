/*
 * layering.ts - the `layering` rule type: the core imports no outside module, the entries stay thin,
 * every core module has a unit test of its own name and the unit tests import no spawning module.
 */

import type { Finding, RuleType, Tree } from "../engine.ts";

export interface LayeringParams {
  core: string[];
  adapters: string[];
  exempt: string[];
  outside: string[];
  entries: string[];
  entryMaxLines: number;
  tests: Array<{ core: string; tests: string }>;
  unitTests: string[];
  unitForbidden: string[];
}

function globToRegExp(glob: string): RegExp {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      if (glob[i + 2] === "/") {
        source += "(?:.*/)?";
        i += 2;
      } else {
        source += ".*";
        i += 1;
      }
    } else if (c === "*") {
      source += "[^/]*";
    } else if (c === "?") {
      source += "[^/]";
    } else {
      source += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

/** A pattern names a directory (everything below it), a file or a glob. */
function matcher(patterns: string[]): (path: string) => boolean {
  const regs = patterns.map((p) => ({ dir: p.replace(/\/+$/, ""), re: globToRegExp(p) }));
  return (path) => regs.some((r) => path === r.dir || path.startsWith(`${r.dir}/`) || r.re.test(path));
}

function importsOf(text: string): Array<{ line: number; spec: string }> {
  const found: Array<{ line: number; spec: string }> = [];
  const re = /(?:\bfrom\s+|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;
  text.split("\n").forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
    for (const m of line.matchAll(re)) found.push({ line: i + 1, spec: m[1] });
  });
  return found;
}

function codeLines(text: string): number {
  let count = 0;
  let inBlock = false;
  for (const raw of text.split("\n")) {
    let line = raw.trim();
    if (inBlock) {
      const end = line.indexOf("*/");
      if (end === -1) continue;
      inBlock = false;
      line = line.slice(end + 2).trim();
    }
    while (line.startsWith("/*")) {
      const end = line.indexOf("*/", 2);
      if (end === -1) {
        inBlock = true;
        line = "";
        break;
      }
      line = line.slice(end + 2).trim();
    }
    if (line === "" || line.startsWith("//")) continue;
    count++;
  }
  return count;
}

function check(tree: Tree, params: LayeringParams): Finding[] {
  const findings: Finding[] = [];
  const inCore = matcher(params.core);
  const inAdapters = matcher(params.adapters);
  const inExempt = matcher(params.exempt);
  const isEntry = matcher(params.entries);
  const inUnitDirs = matcher(params.unitTests);
  const paths = tree.files.map((f) => f.path);
  const tracked = new Set(paths);

  for (const path of paths) {
    const text = (): string => tree.read(path) ?? "";
    if (isEntry(path)) {
      const n = codeLines(text());
      if (n > params.entryMaxLines) {
        findings.push({ path, line: 0, message: `entry holds ${n} lines of code, the cap is ${params.entryMaxLines}` });
      }
    }
    if (path.endsWith(".ts") && inCore(path) && !inAdapters(path)) {
      for (const imp of importsOf(text())) {
        if (params.outside.includes(imp.spec)) {
          findings.push({ path, line: imp.line, message: `core module imports ${imp.spec}` });
        }
      }
      if (!inExempt(path)) {
        const map = params.tests.find((t) => path.startsWith(`${t.core.replace(/\/+$/, "")}/`));
        if (!map) {
          findings.push({ path, line: 0, message: "core module is under no tests mapping" });
        } else {
          const rest = path.slice(map.core.replace(/\/+$/, "").length + 1).replace(/\.ts$/, "");
          const want = `${map.tests.replace(/\/+$/, "")}/${rest}.unit.test.ts`;
          if (!tracked.has(want)) findings.push({ path, line: 0, message: `core module has no unit test ${want}` });
        }
      }
    }
    if (path.endsWith(".unit.test.ts") && inUnitDirs(path)) {
      for (const imp of importsOf(text())) {
        if (params.unitForbidden.some((f) => imp.spec === f || imp.spec.endsWith(`/${f}`))) {
          findings.push({ path, line: imp.line, message: `unit test imports ${imp.spec}` });
        }
      }
    }
  }
  return findings;
}

const files: Record<string, string> = {
  "lib/a.ts": 'import fs from "node:fs";\n',
  "tests/lib/b.unit.test.ts": 'import { x } from "../harness/run.ts";\n',
  "tests/lib/a.unit.test.ts": "",
  "entry.ts": "a\nb\nc\n",
};

const layering: RuleType<LayeringParams> = {
  name: "layering",
  check,
  selfCheck: {
    tree: {
      files: Object.keys(files).map((path) => ({ path, mode: "100644" })),
      read: (path) => files[path] ?? null,
      list: () => [],
    },
    params: {
      core: ["lib"],
      adapters: [],
      exempt: [],
      outside: ["node:fs"],
      entries: ["entry.ts"],
      entryMaxLines: 2,
      tests: [{ core: "lib", tests: "tests/lib" }],
      unitTests: ["tests/lib"],
      unitForbidden: ["harness/run.ts"],
    },
  },
};

export default layering;
