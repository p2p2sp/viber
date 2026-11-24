/*
 * summary-path.ts - the summary-path core: names the file `intent` writes its
 * confirmed summary to and creates its directory. The contract lives in the
 * header of ../skills/intent/scripts/summary-path.ts.
 */

import type { Clock, Fs, Git } from "./ports.ts";
import { stampOf } from "./stamp.ts";

export interface SummaryPathResult {
  stdout: string;
  stderr: string;
  exit: number;
}

function fail(reason: string): SummaryPathResult {
  return { stdout: "", stderr: `error: ${reason}\n`, exit: 2 };
}

/** The stdout, stderr and exit code of one summary-path call. Never throws. */
export function runSummaryPath(argv: string[], cwd: string, ports: { fs: Fs; git: Git; clock: Clock }): SummaryPathResult {
  if (argv.length > 0) return fail("summary-path.sh takes no argument");
  const here = cwd.replaceAll("\\", "/");
  // Outside a repository the cwd stands for the root.
  const root = (ports.git.repoRoot(here) ?? here).replace(/\/$/, "");
  const dir = `${root}/.temp/viber/intent`;
  if (!ports.fs.makeDir(dir)) return fail(`cannot create ${dir}`);
  return { stdout: `NEXT: write | path: ${dir}/summary-${stampOf(ports.clock.now())}.md\n`, stderr: "", exit: 0 };
}
