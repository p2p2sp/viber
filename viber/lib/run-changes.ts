/*
 * run-changes.ts - the run-changes core: names the commit a run started from
 * and every path of the working tree that differs from it. The contract lives
 * in the header of ../scripts/run-changes.ts.
 */

import { absolutePath } from "./abs-path.ts";
import type { Git } from "./ports.ts";

export interface RunChangesResult {
  stdout: string;
  stderr: string;
  exit: number;
}

function fail(reason: string): RunChangesResult {
  return { stdout: "", stderr: `error: ${reason}\n`, exit: 2 };
}

/** The stdout, stderr and exit code of one run-changes call. Never throws. */
export function runRunChanges(argv: string[], cwd: string, ports: { git: Git }): RunChangesResult {
  if (argv.length > 1) return fail("usage: run-changes.sh [<run-dir>]");
  const root = ports.git.repoRoot(cwd.replaceAll("\\", "/"));
  if (root === null) return fail("not inside a git repository");

  let base = "HEAD";
  const raw = argv[0] ?? "";
  if (raw !== "") {
    const top = root.replace(/\/$/, "");
    const plan = `${raw.replaceAll("\\", "/").replace(/\/+$/, "") || "/"}/plan.md`;
    // A path below the root is asked for repo-relative, spelled one way; any
    // other goes to git as written, which follows a link before it refuses.
    const full = absolutePath(plan, top);
    const found = ports.git.firstAdded(root, full.startsWith(`${top}/`) ? full.slice(top.length + 1) : plan);
    if (found === null) return { stdout: "base: none\n", stderr: "", exit: 0 };
    base = found;
  }

  const seen = new Set<string>();
  const lines = [`base: ${base}`];
  for (const path of [...ports.git.changedFiles(root, base).map((file) => file.path), ...ports.git.untrackedFiles(root)]) {
    if (path === "" || seen.has(path)) continue;
    seen.add(path);
    lines.push(`changed: ${path}`);
  }
  return { stdout: `${lines.join("\n")}\n`, stderr: "", exit: 0 };
}
