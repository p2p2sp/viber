/*
 * engine.ts - the lint rule engine: runs rule instances against a tree, after proving each
 * selected rule type reports on its own bad sample, so a green run is never vacuous.
 */

import type { TrackedFile } from "../../viber/lib/ports.ts";

export interface Tree {
  files: TrackedFile[];
  read(path: string): string | null;
  list(dir: string): string[];
}

/** line 0 when the finding is about the whole file. */
export interface Finding { path: string; line: number; message: string }

export interface RuleType<P> {
  name: string;
  check(tree: Tree, params: P): Finding[];
  selfCheck: { tree: Tree; params: P };
}

/** id is "<type>/<name>". */
export interface RuleInstance { id: string; type: string; params: unknown; why: string }

export function runLint(
  tree: Tree,
  types: RuleType<any>[],
  rules: RuleInstance[],
  selected: string[],
): { lines: string[]; status: 0 | 1 | 2 } {
  const matches = (arg: string, rule: RuleInstance): boolean => rule.id === arg || rule.id.startsWith(`${arg}/`);
  const chosen = selected.length === 0 ? rules : rules.filter((r) => selected.some((arg) => matches(arg, r)));
  const unmatched = selected.some((arg) => !rules.some((r) => matches(arg, r)));

  const lines: string[] = [];
  let failed = false;
  let findings = 0;
  const usable = new Map<string, RuleType<any>>();

  for (const name of new Set(chosen.map((r) => r.type))) {
    const type = types.find((t) => t.name === name);
    if (!type) {
      for (const r of chosen.filter((c) => c.type === name)) lines.push(`${r.id}: unknown rule type ${name}`);
      failed = true;
    } else if (type.check(type.selfCheck.tree, type.selfCheck.params).length === 0) {
      lines.push(`self-check: ${name} reported nothing on its bad sample`);
      failed = true;
    } else {
      usable.set(name, type);
    }
  }

  for (const rule of chosen) {
    const type = usable.get(rule.type);
    if (!type) continue;
    for (const f of type.check(tree, rule.params)) {
      lines.push(`${f.path}:${f.line}: [${rule.id}] ${f.message}`);
      findings++;
      failed = true;
    }
  }

  lines.push(`lint: ${findings} findings, ${chosen.length} rules`);
  return { lines, status: unmatched ? 2 : failed ? 1 : 0 };
}
