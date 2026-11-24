/*
 * reports.ts - the one-purpose reports of the config: --red-check, --questions
 * and --specifications, from the text of .claude/viber.yml (null: no file).
 */

import { directory } from "./block.ts";
import { readChildren } from "./lines.ts";

const DEFAULT_TESTS =
  "__tests__/ tests/ test/ *.Tests/ *.UnitTests/ *.IntegrationTests/ *.test.* *.spec.* test_*.py *_test.py *_test.go *Test.java *Test.kt conftest.py testdata/ __mocks__/ __fixtures__/ fixtures/ jest.config.* vitest.config.*";

/** The value cut at its first blank followed by `#` (a value opening on `#` is a comment alone), its entries joined by one space. */
function list(raw: string | undefined, fallback: string): string {
  let v = raw ?? "";
  if (v.startsWith("#")) v = "";
  v = v.replace(/\s#.*$/s, "");
  const entries = v.split(/\s+/).filter((e) => e !== "");
  return entries.length === 0 ? fallback : entries.join(" ");
}

export function resolveRedCheck(text: string | null): string[] {
  const children = readChildren(text ?? "");
  return [
    `red-check.tests: ${list(children.get("build.red-check-tests"), DEFAULT_TESTS)}`,
    `red-check.links: ${list(children.get("build.red-check-links"), "node_modules")}`,
  ];
}

export function resolveQuestions(text: string | null): string[] {
  const v = (readChildren(text ?? "").get("planning.questions-per-round") ?? "").replace(/[\s#].*$/s, "");
  return [/^([1-9]|10|all)$/.test(v) ? v : "5"];
}

export function resolveSpecifications(text: string | null): string[] {
  return [directory(readChildren(text ?? "").get("directories.specifications"), "specs")];
}
