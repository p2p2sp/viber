/*
 * check_contrast.unit.test.ts - locks down input validation on the WCAG contrast
 * gate: an out-of-range rgb() component and a non-string JSON fg/bg must be
 * rejected with exit 2 (usage/bad-input), never silently coerced or thrown
 * as an uncaught TypeError - reserving exit 1 for a genuine AA failure.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is
 * run directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/check_contrast.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseColor, main } from "../../viber/skills/ui-designer/scripts/check_contrast.ts";

// ---------------------------------------------------------------------------
// parseColor - out-of-range rgb() components
// ---------------------------------------------------------------------------

test("parseColor rejects an rgb() component above 255", () => {
  assert.throws(() => parseColor("rgb(999,999,999)"));
});

// ---------------------------------------------------------------------------
// main - CLI: out-of-range rgb() returns 2, not a fake PASS
// ---------------------------------------------------------------------------

test("main returns 2 for an out-of-range rgb() pair on the CLI, not a fake pass", () => {
  const code = main(["rgb(999,999,999)", "#000"]);
  assert.equal(code, 2);
});

// ---------------------------------------------------------------------------
// main - --json: non-string fg/bg returns 2, not a crash
// ---------------------------------------------------------------------------

function writeJson(records: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "check-contrast-"));
  const file = join(dir, "pairs.json");
  writeFileSync(file, JSON.stringify(records), "utf-8");
  return file;
}

test("main returns 2 for a numeric fg in a --json record, not a TypeError", () => {
  const file = writeJson([{ fg: 17, bg: "#fff" }]);
  try {
    const code = main(["--json", file]);
    assert.equal(code, 2);
  } finally {
    rmSync(file, { force: true });
  }
});

test("main returns 2 for a numeric bg in a --json record, not a TypeError", () => {
  const file = writeJson([{ fg: "#000", bg: 17 }]);
  try {
    const code = main(["--json", file]);
    assert.equal(code, 2);
  } finally {
    rmSync(file, { force: true });
  }
});

test("main returns 2 for a record missing fg under a mistyped key", () => {
  const file = writeJson([{ foreground: "#000", bg: "#fff" }]);
  try {
    const code = main(["--json", file]);
    assert.equal(code, 2);
  } finally {
    rmSync(file, { force: true });
  }
});

// ---------------------------------------------------------------------------
// main - a genuine AA failure still returns 1, not 2
// ---------------------------------------------------------------------------

test("main returns 1 for a genuine AA contrast failure", () => {
  const code = main(["#777777", "#7a7a7a"]);
  assert.equal(code, 1);
});

// ---------------------------------------------------------------------------
// main - a failing pair followed by a malformed pair returns 2, not 1
// ---------------------------------------------------------------------------

test("main returns 2 when an AA failure is followed by a malformed pair", () => {
  const file = writeJson([
    { fg: "#777777", bg: "#7a7a7a" },
    { fg: 17, bg: "#fff" },
  ]);
  try {
    const code = main(["--json", file]);
    assert.equal(code, 2);
  } finally {
    rmSync(file, { force: true });
  }
});

// ---------------------------------------------------------------------------
// Regression: shorthand and full hex still parse; range check is rgb()-only
// ---------------------------------------------------------------------------

test("parseColor still accepts #rgb shorthand and #rrggbb", () => {
  assert.deepEqual(parseColor("#fff"), [255, 255, 255]);
  assert.deepEqual(parseColor("#ffffff"), [255, 255, 255]);
});
