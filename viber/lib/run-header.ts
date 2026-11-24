/*
 * run-header.ts - reads the header of the run.md file of a code-auditor run:
 * the `<key>: <value>` lines before its first `## ` line (keep-units,
 * hunt-return).
 */

/** The value of the first `<key>: ` line of the header of a run.md text, a trailing carriage return removed; empty when absent. */
export function headerValue(text: string, key: string): string {
  for (const line of text.split("\n")) {
    if (line.startsWith("## ")) return "";
    if (line.startsWith(`${key}: `)) return line.slice(key.length + 2).replace(/\r$/, "");
  }
  return "";
}
