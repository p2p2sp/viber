/*
 * lint_skill.test.ts - proves viber/skills/skill-designer/scripts/lint_skill.sh
 * opens a SKILL.md the same way whatever its line endings: a file saved with
 * CRLF (a Windows checkout, an editor default) must lint exactly like its LF
 * copy, so the carriage return on the first line never turns a valid `---`
 * opener into a false "no YAML frontmatter" failure.
 *
 * The printed `FAIL=<n> WARN=<m>` line and the exit code are the whole
 * interface; the cases run the linter on a throwaway skill file.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/lint_skill.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withTempDir } from "../harness/tmp.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/skills/skill-designer/scripts/lint_skill.sh");

const VALID_LINES = [
  "---",
  "name: sample-skill",
  "description: Summarizes a changelog into release notes for a project. Use when the user asks for release notes or a changelog digest.",
  "---",
  "",
  "# Sample skill",
  "",
  "Read the changelog and write the notes.",
  "",
];

async function lint(content: string) {
  return withTempDir("p2p2-lint-", async (dir) => {
    const file = path.join(dir, "SKILL.md");
    fs.writeFileSync(file, content);
    return runScript(SUT, [file], { shell: "bash" });
  });
}

test("a valid SKILL.md with LF endings prints FAIL=0 WARN=0 and exits 0", async () => {
  const res = await lint(VALID_LINES.join("\n"));
  assert.equal(res.stdout.trim(), "FAIL=0 WARN=0");
  assert.equal(res.status, 0);
});

test("the CRLF copy of a valid SKILL.md prints FAIL=0 WARN=0 and exits 0 (a carriage return on the opener must not read as missing frontmatter)", async () => {
  const res = await lint(VALID_LINES.join("\r\n"));
  assert.equal(res.stdout.trim(), "FAIL=0 WARN=0");
  assert.equal(res.status, 0);
});

test("a SKILL.md with no frontmatter still reports no YAML frontmatter and exits 1", async () => {
  const res = await lint(VALID_LINES.slice(4).join("\n"));
  assert.match(res.stdout, /no YAML frontmatter/);
  assert.equal(res.status, 1);
});
