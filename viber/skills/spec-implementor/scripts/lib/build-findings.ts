/*
 * build-findings.ts - cuts a review report into what the coder fixes and what
 * the outcome keeps. The report format is the contract of task-reviewer,
 * final-reviewer and final-tester:
 *
 *   - Critical | <path>:<line> or - | <kind> | <what and the proof> | <fix>
 *   - Minor | <path>:<line> | <what>
 *
 * <kind> is one of DoD.<k>, R<n>, D<n>, Contract, Verify, Bug, Leftover, Test, UI.
 * A line indented under a finding belongs to it. Every other line is ignored.
 */

export interface Findings {
  /** The Critical findings holding all five fields: the coder fixes exactly these. */
  critical: string[];
  minor: string[];
  /** The Critical lines missing a field: no coder can act on them. */
  malformed: string[];
}

export function readFindings(report: string): Findings {
  const found: Findings = { critical: [], minor: [], malformed: [] };
  let last: string[] | null = null;
  for (const line of report.split(/\r?\n/)) {
    if (/^- Critical\b/.test(line)) {
      // A "|" inside the proof splits it: the fix is the last field, the proof everything between.
      const [, where = "", kind = "", ...rest] = line.split("|").map((part) => part.trim());
      const fix = rest.pop() ?? "";
      last = [where, kind, rest.join(" | "), fix].every((field) => field !== "") ? found.critical : found.malformed;
      last.push(line.trimEnd());
    } else if (/^- Minor\b/.test(line)) {
      last = found.minor;
      last.push(line.trimEnd());
    } else if (last !== null && /^\s+\S/.test(line)) last[last.length - 1] += `\n${line.trimEnd()}`;
    else last = null;
  }
  return found;
}

/** The fix file of the findings: empty means PASS. */
export const fixText = (critical: string[]): string => critical.map((finding) => `${finding}\n`).join("");
